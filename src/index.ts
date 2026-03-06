import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { formatJson } from "./format.js";
import { SeqClient, SeqHttpError, SeqNetworkError } from "./seq-client.js";
import {
  SEQ_ROUTE_CATALOG,
  type SeqRouteCatalogEntry
} from "./route-catalog.js";

const config = loadConfig();
const seq = new SeqClient(config);

const server = new McpServer({
  name: "seq-mcp",
  version: "0.2.0"
});

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const stringRecordSchema = z.record(z.string(), z.string()).optional();
const genericJsonSchema = z.unknown().optional();

function okResult(value: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: formatJson(value)
      }
    ]
  };
}

function errorResult(
  tool: string,
  error: unknown,
  requiredPermission?: string
): ToolResult {
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
                "Confirm SEQ_URL points to the correct Seq instance."
              ]
            })
          }
        ]
      };
    }

    if (error.status === 403) {
      const remediation = [
        "The API key does not have enough permissions for this request."
      ];

      if (requiredPermission) {
        remediation.push(
          `Enable '${requiredPermission}' permission on the Seq API key.`
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
              remediation
            })
          }
        ]
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
                : error.payload ?? error.message
          })
        }
      ]
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
              "Check network, DNS, and TLS settings."
            ]
          })
        }
      ]
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
          detail: message
        })
      }
    ]
  };
}

async function withGracefulErrors(
  tool: string,
  handler: () => Promise<unknown>,
  requiredPermission?: string
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

function resolvePathTemplate(
  template: string,
  pathParams?: Record<string, string>
): string {
  const withoutQueryTemplate = template.replace(/\{\?[^}]+\}/g, "");

  return withoutQueryTemplate.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = pathParams?.[key];
    if (!value) {
      throw new Error(
        `Missing path parameter '${key}' for route template '${template}'.`
      );
    }

    return encodeURIComponent(value);
  });
}

async function discoverLiveLinks(): Promise<
  Array<{ source: string; name: string; route: string }>
> {
  const root = (await seq.request({ method: "GET", path: "" })) as {
    Links?: Record<string, string>;
  };

  const links: Array<{ source: string; name: string; route: string }> = [];
  const rootLinks = root.Links ?? {};

  for (const [name, route] of Object.entries(rootLinks)) {
    links.push({ source: "api", name, route });

    if (!route.endsWith("/resources")) {
      continue;
    }

    try {
      const resourceDoc = (await seq.request({
        method: "GET",
        path: route
      })) as { Links?: Record<string, string> };

      for (const [resourceName, resourceRoute] of Object.entries(
        resourceDoc.Links ?? {}
      )) {
        links.push({ source: route, name: resourceName, route: resourceRoute });
      }
    } catch {
      // Continue discovery even when some resources are restricted by permissions.
    }
  }

  return links;
}

server.tool(
  "seq_connection_test",
  {
    includeApiInfo: z.boolean().optional().default(true)
  },
  async ({ includeApiInfo }) => {
    return withGracefulErrors("seq_connection_test", async () => {
      const health = await seq.request({ method: "GET", path: "/health" });
      const result: Record<string, unknown> = {
        seqApiBase: config.seqUrl,
        health
      };

      if (includeApiInfo) {
        result.api = await seq.request({ method: "GET", path: "" });
      }

      return result;
    });
  }
);

server.tool(
  "seq_api_catalog",
  {
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
    permission: z.string().optional(),
    search: z.string().optional(),
    includeNotes: z.boolean().optional().default(false)
  },
  async ({ method, permission, search, includeNotes }) => {
    const filtered = SEQ_ROUTE_CATALOG.filter((entry) => {
      if (method && entry.method !== method) {
        return false;
      }

      if (permission && entry.permission.toLowerCase() !== permission.toLowerCase()) {
        return false;
      }

      if (search) {
        const needle = search.toLowerCase();
        const haystack = `${entry.path} ${entry.permission} ${entry.additional} ${entry.notes}`.toLowerCase();
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
      notes: includeNotes ? entry.notes : undefined
    }));

    return okResult({
      total: filtered.length,
      entries: filtered
    });
  }
);

server.tool(
  "seq_api_live_links",
  {
    sourceFilter: z.string().optional()
  },
  async ({ sourceFilter }) => {
    return withGracefulErrors("seq_api_live_links", async () => {
      const links = await discoverLiveLinks();
      const filtered = sourceFilter
        ? links.filter((l) => l.source.includes(sourceFilter))
        : links;

      return {
        total: filtered.length,
        links: filtered
      };
    });
  }
);

server.tool(
  "seq_api_request",
  {
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().min(1),
    pathParams: stringRecordSchema,
    query: stringRecordSchema,
    body: genericJsonSchema,
    contentType: z.string().optional()
  },
  async ({ method, path, pathParams, query, body, contentType }) => {
    return withGracefulErrors("seq_api_request", async () => {
      const resolvedPath = resolvePathTemplate(path, pathParams);

      const response = await seq.request({
        method,
        path: resolvedPath,
        query,
        body,
        contentType
      });

      return {
        route: path,
        resolvedPath,
        method,
        response
      };
    });
  }
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
      contentType: z.string().optional()
    },
    async ({ pathParams, query, body, contentType }) => {
      return withGracefulErrors(
        toolName,
        async () => {
          const resolvedPath = resolvePathTemplate(entry.path, pathParams);
          const response = await seq.request({
            method: entry.method,
            path: resolvedPath,
            query,
            body,
            contentType
          });

          return {
            route: entry.path,
            resolvedPath,
            method: entry.method,
            permission: entry.permission,
            additionalRequirements: entry.additional,
            response
          };
        },
        entry.permission
      );
    }
  );
}

async function start(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`seq-mcp startup error: ${message}\n`);
  process.exit(1);
});
