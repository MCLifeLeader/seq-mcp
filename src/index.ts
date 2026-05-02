import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import process from "node:process";
import { z } from "zod";
import { loadConfig, type ServerConfig } from "./config.js";
import { formatJson } from "./format.js";
import {
    SeqClient,
    SeqHttpError,
    SeqNetworkError,
    SeqRequestValidationError,
    SeqResponseTooLargeError,
} from "./seq-client.js";
import {
    SEQ_ROUTE_CATALOG,
    type SeqRouteCatalogEntry,
} from "./route-catalog.js";

let config: ServerConfig | undefined;
let seq: SeqClient | undefined;

const server = new McpServer({
    name: "mcp-seq-otel",
    version: "0.3.1",
});

const MAX_QUERY_ENTRIES = 25;
const MAX_PATH_PARAM_ENTRIES = 10;
const MAX_STRING_VALUE_LENGTH = 2_048;
const MAX_ROUTE_TEMPLATE_LENGTH = 256;
const MAX_RESOLVED_PATH_LENGTH = 4_096;
const MAX_DISCOVERED_LINKS = 1_000;
const OWNERSHIP_SCOPED_LIST_QUERY = Object.freeze({
    shared: "true",
    personal: "true",
});

interface ToolResult {
    [key: string]: unknown;
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

const constrainedStringSchema = z.string().min(1).max(MAX_STRING_VALUE_LENGTH);
const stringRecordSchema = z
    .record(z.string().min(1).max(100), constrainedStringSchema)
    .optional();
const genericJsonSchema = z.unknown().optional();

function getConfig(): ServerConfig {
    if (!config) {
        config = loadConfig();
    }

    return config;
}

function getSeqClient(): SeqClient {
    if (!seq) {
        seq = new SeqClient(getConfig());
    }

    return seq;
}

function okResult(value: unknown): ToolResult {
    return {
        content: [
            {
                type: "text",
                text: formatJson(value),
            },
        ],
    };
}

function errorResult(
    tool: string,
    error: unknown,
    requiredPermission?: string,
): ToolResult {
    if (error instanceof SeqRequestValidationError) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: formatJson({
                        error: "Invalid Seq API request.",
                        tool,
                        endpoint: error.endpoint,
                        detail: error.message,
                        remediation: [
                            "Use seq_api_catalog to choose an official Seq route template.",
                            "Reduce path, query, or body size if this request exceeds the server limits.",
                        ],
                    }),
                },
            ],
        };
    }

    if (error instanceof SeqResponseTooLargeError) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: formatJson({
                        error: "Seq API response exceeded the configured size limit.",
                        tool,
                        endpoint: error.endpoint,
                        responseBytes: error.responseBytes,
                        maxResponseBytes: error.maxResponseBytes,
                        remediation: [
                            "Narrow the Seq query or time range.",
                            "Lower count-style parameters when available.",
                            "Increase SEQ_MAX_RESPONSE_BYTES only if larger payloads are expected and safe.",
                        ],
                    }),
                },
            ],
        };
    }

    if (error instanceof SeqHttpError) {
        if (error.status === 401) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: formatJson({
                            error: "Unauthorized to Seq API.",
                            tool,
                            status: error.status,
                            endpoint: error.endpoint,
                            remediation: [
                                "Verify SEQ_API_KEY is valid.",
                                "Confirm SEQ_URL points to the correct Seq instance.",
                            ],
                        }),
                    },
                ],
            };
        }

        if (error.status === 403) {
            const remediation = [
                "The API key does not have enough permissions for this request.",
            ];

            if (requiredPermission) {
                remediation.push(
                    `Enable '${requiredPermission}' permission on the Seq API key.`,
                );
            }

            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: formatJson({
                            error: "Permission denied by Seq API.",
                            tool,
                            status: error.status,
                            endpoint: error.endpoint,
                            requiredPermission: requiredPermission ?? "unknown",
                            remediation,
                        }),
                    },
                ],
            };
        }

        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: formatJson({
                        error: "Seq API request failed.",
                        tool,
                        status: error.status,
                        endpoint: error.endpoint,
                        detail:
                            typeof error.payload === "string"
                                ? error.payload
                                : (error.payload ?? error.message),
                    }),
                },
            ],
        };
    }

    if (error instanceof SeqNetworkError) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: formatJson({
                        error: "Failed to reach Seq API.",
                        tool,
                        endpoint: error.endpoint,
                        detail: error.message,
                        remediation: [
                            "Verify SEQ_URL is reachable from this runtime.",
                            "Check network, DNS, and TLS settings.",
                        ],
                    }),
                },
            ],
        };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
        isError: true,
        content: [
            {
                type: "text",
                text: formatJson({
                    error: "Unexpected tool error.",
                    tool,
                    detail: message,
                }),
            },
        ],
    };
}

async function withGracefulErrors(
    tool: string,
    handler: () => Promise<unknown>,
    requiredPermission?: string,
): Promise<ToolResult> {
    try {
        const value = await handler();
        return okResult(value);
    } catch (error: unknown) {
        return errorResult(tool, error, requiredPermission);
    }
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/\{\?[^}]+\}/g, "")
        .replace(/\{[^}]+\}/g, "by")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

function ensureRecordWithinLimit(
    label: string,
    value: Record<string, string> | undefined,
    maxEntries: number,
): void {
    if (!value) {
        return;
    }

    const entries = Object.keys(value).length;
    if (entries > maxEntries) {
        throw new SeqRequestValidationError(
            label,
            `${label} supports at most ${maxEntries} entries.`,
        );
    }
}

function getCatalogEntryOrThrow(
    method: SeqMethod,
    path: string,
): SeqRouteCatalogEntry {
    const entry = findCatalogEntry(method, path);
    if (!entry) {
        throw new SeqRequestValidationError(
            path,
            `Unsupported Seq route '${method} ${path}'.`,
        );
    }

    return entry;
}

function resolvePathTemplate(
    template: string,
    pathParams?: Record<string, string>,
): string {
    const withoutQueryTemplate = template.replace(/\{\?[^}]+\}/g, "");

    const resolvedPath = withoutQueryTemplate.replace(
        /\{([^}]+)\}/g,
        (_, key: string) => {
            const value = pathParams?.[key];
            if (!value) {
                throw new SeqRequestValidationError(
                    template,
                    `Missing path parameter '${key}' for route template '${template}'.`,
                );
            }

            return encodeURIComponent(value);
        },
    );

    if (resolvedPath.length > MAX_RESOLVED_PATH_LENGTH) {
        throw new SeqRequestValidationError(
            template,
            `Resolved path exceeds ${MAX_RESOLVED_PATH_LENGTH} characters for route template '${template}'.`,
        );
    }

    return resolvedPath;
}

type SeqMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function findCatalogEntry(
    method: SeqMethod,
    path: string,
): SeqRouteCatalogEntry | undefined {
    return SEQ_ROUTE_CATALOG.find(
        (entry) => entry.method === method && entry.path === path,
    );
}

async function callCatalogRoute(
    method: SeqMethod,
    path: string,
    options?: {
        pathParams?: Record<string, string>;
        query?: Record<string, string | undefined>;
        body?: unknown;
        contentType?: string;
    },
): Promise<unknown> {
    const resolvedPath = resolvePathTemplate(path, options?.pathParams);
    return getSeqClient().request({
        method,
        path: resolvedPath,
        query: options?.query,
        body: options?.body,
        contentType: options?.contentType,
    });
}

async function discoverLiveLinks(): Promise<
    Array<{ source: string; name: string; route: string }>
> {
    const root = (await getSeqClient().request({
        method: "GET",
        path: "",
    })) as {
        Links?: Record<string, string>;
    };

    const links: Array<{ source: string; name: string; route: string }> = [];
    const rootLinks = root.Links ?? {};

    for (const [name, route] of Object.entries(rootLinks)) {
        if (links.length >= MAX_DISCOVERED_LINKS) {
            break;
        }

        links.push({ source: "api", name, route });

        if (!route.endsWith("/resources")) {
            continue;
        }

        try {
            const resourceDoc = (await getSeqClient().request({
                method: "GET",
                path: route,
            })) as { Links?: Record<string, string> };

            for (const [resourceName, resourceRoute] of Object.entries(
                resourceDoc.Links ?? {},
            )) {
                if (links.length >= MAX_DISCOVERED_LINKS) {
                    break;
                }

                links.push({
                    source: route,
                    name: resourceName,
                    route: resourceRoute,
                });
            }
        } catch {
            // Continue discovery even when some resources are restricted by permissions.
        }
    }

    return links;
}

function callOwnershipScopedListRoute(path: string): Promise<unknown> {
    return callCatalogRoute("GET", path, {
        query: OWNERSHIP_SCOPED_LIST_QUERY,
    });
}

const TRACE_LEVEL_ALIASES = [
    "Trace",
    "TRACE",
    "trace",
    "TRC",
    "trc",
    "Verbose",
    "VERBOSE",
    "verbose",
    "VRB",
    "vrb",
];
const DEBUG_LEVEL_ALIASES = [
    "Debug",
    "DEBUG",
    "debug",
    "DBG",
    "dbg",
    "DBUG",
    "dbug",
];
const INFORMATION_LEVEL_ALIASES = [
    "Information",
    "INFO",
    "Info",
    "info",
    "INF",
    "inf",
];
const WARNING_LEVEL_ALIASES = ["Warning", "WARN", "Warn", "warn", "WRN", "wrn"];
const ERROR_LEVEL_ALIASES = ["Error", "ERROR", "error", "ERR", "err"];
const FATAL_LEVEL_ALIASES = [
    "Fatal",
    "FATAL",
    "fatal",
    "FTL",
    "ftl",
    "Critical",
    "CRITICAL",
    "critical",
    "Crit",
    "CRIT",
    "crit",
];

const LOG_LEVEL_ALIASES = new Map<string, string[]>([
    ["trace", TRACE_LEVEL_ALIASES],
    ["trc", TRACE_LEVEL_ALIASES],
    ["verbose", TRACE_LEVEL_ALIASES],
    ["vrb", TRACE_LEVEL_ALIASES],
    ["debug", DEBUG_LEVEL_ALIASES],
    ["dbg", DEBUG_LEVEL_ALIASES],
    ["dbug", DEBUG_LEVEL_ALIASES],
    ["information", INFORMATION_LEVEL_ALIASES],
    ["info", INFORMATION_LEVEL_ALIASES],
    ["inf", INFORMATION_LEVEL_ALIASES],
    ["warning", WARNING_LEVEL_ALIASES],
    ["warn", WARNING_LEVEL_ALIASES],
    ["wrn", WARNING_LEVEL_ALIASES],
    ["error", ERROR_LEVEL_ALIASES],
    ["err", ERROR_LEVEL_ALIASES],
    ["fatal", FATAL_LEVEL_ALIASES],
    ["ftl", FATAL_LEVEL_ALIASES],
    ["critical", FATAL_LEVEL_ALIASES],
    ["crit", FATAL_LEVEL_ALIASES],
]);

function expandCommonLevelAliases(
    filter: string | undefined,
): string | undefined {
    if (filter === undefined) {
        return undefined;
    }

    return filter.replace(
        /@Level\s*=\s*(['"])([^'"]+)\1/gi,
        (match, _, level) => {
            const aliases = LOG_LEVEL_ALIASES.get(String(level).toLowerCase());
            if (aliases === undefined) {
                return match;
            }

            const comparisons = aliases.map((alias) => `@Level = '${alias}'`);
            return `(${comparisons.join(" or ")})`;
        },
    );
}

server.tool("seq_starter_overview", {}, async () => {
    return withGracefulErrors("seq_starter_overview", async () => {
        const calls = await Promise.allSettled([
            callCatalogRoute("GET", "api", {}),
            callCatalogRoute("GET", "api/users/current", {}),
            callCatalogRoute("GET", "api/diagnostics/status", {}),
            callOwnershipScopedListRoute("api/signals"),
            callOwnershipScopedListRoute("api/workspaces"),
        ]);

        const valueOrError = (
            result: PromiseSettledResult<unknown>,
        ): unknown => {
            if (result.status === "fulfilled") {
                return result.value;
            }

            return {
                unavailable: true,
                reason:
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
            };
        };

        return {
            api: valueOrError(calls[0]),
            currentUser: valueOrError(calls[1]),
            diagnosticsStatus: valueOrError(calls[2]),
            signals: valueOrError(calls[3]),
            workspaces: valueOrError(calls[4]),
        };
    });
});

server.tool(
    "seq_starter_events_search",
    {
        filter: z.string().optional(),
        signal: z.string().optional(),
        count: z.number().int().min(1).max(500).optional().default(50),
        fromDateUtc: z.string().optional(),
        toDateUtc: z.string().optional(),
        render: z.boolean().optional().default(false),
    },
    async ({ filter, signal, count, fromDateUtc, toDateUtc, render }) => {
        const route = findCatalogEntry("GET", "api/events");
        return withGracefulErrors(
            "seq_starter_events_search",
            async () =>
                callCatalogRoute("GET", "api/events", {
                    query: {
                        filter: expandCommonLevelAliases(filter),
                        signal,
                        count: String(count),
                        fromDateUtc,
                        toDateUtc,
                        render: String(render),
                    },
                }),
            route?.permission,
        );
    },
);

server.tool(
    "seq_starter_event_by_id",
    {
        id: z.string().min(1),
        render: z.boolean().optional().default(false),
    },
    async ({ id, render }) => {
        const route = findCatalogEntry("GET", "api/events/{id}");
        return withGracefulErrors(
            "seq_starter_event_by_id",
            async () =>
                callCatalogRoute("GET", "api/events/{id}", {
                    pathParams: { id },
                    query: { render: String(render) },
                }),
            route?.permission,
        );
    },
);

server.tool(
    "seq_starter_data_query",
    {
        q: z.string().min(1),
        signalId: z.string().optional(),
        fromDateUtc: z.string().optional(),
        toDateUtc: z.string().optional(),
        count: z.number().int().min(1).max(500).optional().default(100),
        usePost: z.boolean().optional().default(false),
    },
    async ({ q, signalId, fromDateUtc, toDateUtc, count, usePost }) => {
        const method: SeqMethod = usePost ? "POST" : "GET";
        const route = findCatalogEntry(method, "api/data");

        return withGracefulErrors(
            "seq_starter_data_query",
            async () =>
                callCatalogRoute(method, "api/data", {
                    query: {
                        q,
                        signalId,
                        fromDateUtc,
                        toDateUtc,
                        count: String(count),
                    },
                    body: usePost ? {} : undefined,
                }),
            route?.permission,
        );
    },
);

server.tool("seq_starter_signals_list", {}, async () => {
    const route = findCatalogEntry("GET", "api/signals");
    return withGracefulErrors(
        "seq_starter_signals_list",
        async () => callOwnershipScopedListRoute("api/signals"),
        route?.permission,
    );
});

server.tool(
    "seq_starter_signal_by_id",
    {
        id: z.string().min(1),
    },
    async ({ id }) => {
        const route = findCatalogEntry("GET", "api/signals/{id}");
        return withGracefulErrors(
            "seq_starter_signal_by_id",
            async () =>
                callCatalogRoute("GET", "api/signals/{id}", {
                    pathParams: { id },
                }),
            route?.permission,
        );
    },
);

server.tool("seq_starter_dashboards_list", {}, async () => {
    const route = findCatalogEntry("GET", "api/dashboards");
    return withGracefulErrors(
        "seq_starter_dashboards_list",
        async () => callOwnershipScopedListRoute("api/dashboards"),
        route?.permission,
    );
});

server.tool("seq_starter_alerts_list", {}, async () => {
    const route = findCatalogEntry("GET", "api/alerts");
    return withGracefulErrors(
        "seq_starter_alerts_list",
        async () => callOwnershipScopedListRoute("api/alerts"),
        route?.permission,
    );
});

server.tool(
    "seq_starter_events_stream",
    {
        filter: z.string().optional(),
        signal: z.string().optional(),
        wait: z.number().int().min(0).max(30).optional().default(5),
        render: z.boolean().optional().default(false),
    },
    async ({ filter, signal, wait, render }) => {
        const route = findCatalogEntry("GET", "api/events/stream");
        return withGracefulErrors(
            "seq_starter_events_stream",
            async () =>
                callCatalogRoute("GET", "api/events/stream", {
                    query: {
                        filter,
                        signal,
                        wait: String(wait),
                        render: String(render),
                    },
                }),
            route?.permission,
        );
    },
);

server.tool("seq_starter_help", {}, async () => {
    return okResult({
        starterTools: [
            "seq_starter_overview",
            "seq_starter_events_search",
            "seq_starter_event_by_id",
            "seq_starter_data_query",
            "seq_starter_signals_list",
            "seq_starter_signal_by_id",
            "seq_starter_dashboards_list",
            "seq_starter_alerts_list",
            "seq_starter_events_stream",
        ],
        note: "Use seq_api_catalog and seq_api_request for full API surface access.",
    });
});

server.tool(
    "seq_connection_test",
    {
        includeApiInfo: z.boolean().optional().default(true),
    },
    async ({ includeApiInfo }) => {
        return withGracefulErrors("seq_connection_test", async () => {
            const seqClient = getSeqClient();
            const health = await seqClient.getHealth();
            const result: Record<string, unknown> = {
                seqApiBase: seqClient.getApiBaseUrl(),
                seqHealthUrl: seqClient.getHealthUrl(),
                health,
            };

            if (includeApiInfo) {
                result.api = await seqClient.request({
                    method: "GET",
                    path: "",
                });
            }

            return result;
        });
    },
);

server.tool(
    "seq_api_catalog",
    {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
        permission: z.string().optional(),
        search: z.string().optional(),
        includeNotes: z.boolean().optional().default(false),
    },
    async ({ method, permission, search, includeNotes }) => {
        const filtered = SEQ_ROUTE_CATALOG.filter((entry) => {
            if (method && entry.method !== method) {
                return false;
            }

            if (
                permission &&
                entry.permission.toLowerCase() !== permission.toLowerCase()
            ) {
                return false;
            }

            if (search) {
                const needle = search.toLowerCase();
                const haystack =
                    `${entry.path} ${entry.permission} ${entry.additional} ${entry.notes}`.toLowerCase();
                if (!haystack.includes(needle)) {
                    return false;
                }
            }

            return true;
        }).map((entry) => ({
            path: entry.path,
            method: entry.method,
            permission: entry.permission,
            additional: entry.additional,
            notes: includeNotes ? entry.notes : undefined,
        }));

        return okResult({
            total: filtered.length,
            entries: filtered,
        });
    },
);

server.tool(
    "seq_api_live_links",
    {
        sourceFilter: z.string().optional(),
    },
    async ({ sourceFilter }) => {
        return withGracefulErrors("seq_api_live_links", async () => {
            const links = await discoverLiveLinks();
            const filtered = sourceFilter
                ? links.filter((l) =>
                      l.source
                          .toLowerCase()
                          .includes(sourceFilter.toLowerCase()),
                  )
                : links;

            return {
                total: filtered.length,
                links: filtered,
            };
        });
    },
);

server.tool(
    "seq_api_request",
    {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().min(1).max(MAX_ROUTE_TEMPLATE_LENGTH),
        pathParams: stringRecordSchema,
        query: stringRecordSchema,
        body: genericJsonSchema,
        contentType: z
            .string()
            .min(1)
            .max(128)
            .refine((value) => !/[\r\n]/.test(value), {
                message: "contentType must not contain line breaks",
            })
            .optional(),
    },
    async ({ method, path, pathParams, query, body, contentType }) => {
        const route = findCatalogEntry(method, path);

        return withGracefulErrors(
            "seq_api_request",
            async () => {
                ensureRecordWithinLimit(
                    "pathParams",
                    pathParams,
                    MAX_PATH_PARAM_ENTRIES,
                );
                ensureRecordWithinLimit("query", query, MAX_QUERY_ENTRIES);

                const catalogEntry =
                    route ?? getCatalogEntryOrThrow(method, path);
                const resolvedPath = resolvePathTemplate(path, pathParams);

                const response = await getSeqClient().request({
                    method,
                    path: resolvedPath,
                    query,
                    body,
                    contentType,
                });

                return {
                    route: path,
                    resolvedPath,
                    method,
                    permission: catalogEntry.permission,
                    response,
                };
            },
            route?.permission,
        );
    },
);

const seenToolNames = new Set<string>();
for (const entry of SEQ_ROUTE_CATALOG) {
    const toolName = `seq_${entry.method.toLowerCase()}_${slugify(entry.path)}`;
    if (seenToolNames.has(toolName)) {
        continue;
    }

    seenToolNames.add(toolName);

    server.tool(
        toolName,
        {
            pathParams: stringRecordSchema,
            query: stringRecordSchema,
            body: genericJsonSchema,
            contentType: z
                .string()
                .min(1)
                .max(128)
                .refine((value) => !/[\r\n]/.test(value), {
                    message: "contentType must not contain line breaks",
                })
                .optional(),
        },
        async ({ pathParams, query, body, contentType }) => {
            return withGracefulErrors(
                toolName,
                async () => {
                    ensureRecordWithinLimit(
                        "pathParams",
                        pathParams,
                        MAX_PATH_PARAM_ENTRIES,
                    );
                    ensureRecordWithinLimit("query", query, MAX_QUERY_ENTRIES);
                    const resolvedPath = resolvePathTemplate(
                        entry.path,
                        pathParams,
                    );
                    const response = await getSeqClient().request({
                        method: entry.method,
                        path: resolvedPath,
                        query,
                        body,
                        contentType,
                    });

                    return {
                        route: entry.path,
                        resolvedPath,
                        method: entry.method,
                        permission: entry.permission,
                        additionalRequirements: entry.additional,
                        response,
                    };
                },
                entry.permission,
            );
        },
    );
}

async function start(): Promise<void> {
    getConfig();
    getSeqClient();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

function writeFatalError(
    prefix: string,
    error: unknown,
    onWritten?: () => void,
): void {
    const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${prefix}: ${message}\n`, onWritten);
}

process.on("uncaughtException", (error: Error) => {
    writeFatalError("mcp-seq-otel uncaught exception", error, () => {
        process.exit(1);
    });
});

process.on("unhandledRejection", (reason: unknown) => {
    writeFatalError("mcp-seq-otel unhandled rejection", reason, () => {
        process.exit(1);
    });
});

start().catch((error: unknown) => {
    writeFatalError("mcp-seq-otel startup error", error, () => {
        process.exit(1);
    });
});
