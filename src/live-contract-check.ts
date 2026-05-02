import process from "node:process";
import { loadConfig } from "./config.js";
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

type ProbeResult =
    | { path: string; status: "ok" }
    | { path: string; status: "http-error"; httpStatus: number; detail: string }
    | { path: string; status: "network-error"; detail: string }
    | { path: string; status: "validation-error"; detail: string };

type LiveLink = { source: string; name: string; route: string };

const MAX_DISCOVERED_LINKS = 1_000;

function normalizeRoute(route: string): string {
    return route.replace(/^\/+/, "").replace(/\{\?[^}]+\}/g, "");
}

function hasPathParameters(path: string): boolean {
    return /\{[^}]+\}/.test(path);
}

function isSafeProbeRoute(entry: SeqRouteCatalogEntry): boolean {
    if (entry.method !== "GET" || hasPathParameters(entry.path)) {
        return false;
    }

    return (
        entry.path === "api" ||
        entry.path === "health" ||
        entry.path === "health/cluster" ||
        entry.path === "api/users/current" ||
        entry.path === "api/diagnostics/status" ||
        entry.path.endsWith("/resources") ||
        entry.path.endsWith("/template") ||
        entry.path.startsWith("api/settings/")
    );
}

async function discoverLiveLinks(client: SeqClient): Promise<LiveLink[]> {
    const root = (await client.request({ method: "GET", path: "" })) as {
        Links?: Record<string, string>;
    };

    const links: LiveLink[] = [];

    for (const [name, route] of Object.entries(root.Links ?? {})) {
        if (links.length >= MAX_DISCOVERED_LINKS) {
            break;
        }

        links.push({ source: "api", name, route: normalizeRoute(route) });

        if (!route.endsWith("/resources")) {
            continue;
        }

        try {
            const resourceDoc = (await client.request({
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
                    source: normalizeRoute(route),
                    name: resourceName,
                    route: normalizeRoute(resourceRoute),
                });
            }
        } catch (error: unknown) {
            if (error instanceof SeqHttpError && error.status === 403) {
                continue;
            }

            throw error;
        }
    }

    return links;
}

async function probeRoute(
    client: SeqClient,
    path: string,
): Promise<ProbeResult> {
    try {
        await client.request({ method: "GET", path });
        return { path, status: "ok" };
    } catch (error: unknown) {
        if (error instanceof SeqHttpError) {
            return {
                path,
                status: "http-error",
                httpStatus: error.status,
                detail:
                    typeof error.payload === "string"
                        ? error.payload
                        : JSON.stringify(error.payload),
            };
        }

        if (error instanceof SeqNetworkError) {
            return { path, status: "network-error", detail: error.message };
        }

        if (
            error instanceof SeqRequestValidationError ||
            error instanceof SeqResponseTooLargeError
        ) {
            return { path, status: "validation-error", detail: error.message };
        }

        throw error;
    }
}

async function main(): Promise<void> {
    const config = loadConfig();
    const client = new SeqClient(config);
    const catalogPaths = new Set(SEQ_ROUTE_CATALOG.map((entry) => entry.path));
    const liveLinks = await discoverLiveLinks(client);
    const liveRoutesMissingFromCatalog = Array.from(
        new Set(
            liveLinks
                .map((link) => link.route)
                .filter((route) => !catalogPaths.has(route)),
        ),
    ).sort();

    const safeProbePaths = Array.from(
        new Set(
            SEQ_ROUTE_CATALOG.filter(isSafeProbeRoute).map(
                (entry) => entry.path,
            ),
        ),
    ).sort();

    const probeResults: ProbeResult[] = [];
    for (const path of safeProbePaths) {
        probeResults.push(await probeRoute(client, path));
    }

    const staleRoutes = probeResults.filter(
        (result): result is Extract<ProbeResult, { status: "http-error" }> =>
            result.status === "http-error" && result.httpStatus === 404,
    );

    const permissionDeniedRoutes = probeResults.filter(
        (result): result is Extract<ProbeResult, { status: "http-error" }> =>
            result.status === "http-error" && result.httpStatus === 403,
    );

    const unexpectedFailures = probeResults.filter((result) => {
        if (result.status === "ok") {
            return false;
        }

        return !(result.status === "http-error" && result.httpStatus === 403);
    });

    const report = {
        seqApiBase: client.getApiBaseUrl(),
        discoveredLinks: {
            total: liveLinks.length,
            liveRoutesMissingFromCatalog,
            sample: liveLinks.slice(0, 20),
        },
        safeProbe: {
            total: safeProbePaths.length,
            staleRoutes,
            permissionDeniedRoutes,
            unexpectedFailures,
        },
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode =
        liveRoutesMissingFromCatalog.length > 0 || staleRoutes.length > 0
            ? 1
            : 0;
}

main().catch((error: unknown) => {
    const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`live-contract-check failed: ${message}\n`);
    process.exit(1);
});
