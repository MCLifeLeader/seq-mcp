import type { ServerConfig } from "./config.js";

export interface SeqRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  contentType?: string;
}

export class SeqHttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly endpoint: string;
  public readonly payload: unknown;

  public constructor(
    status: number,
    statusText: string,
    endpoint: string,
    payload: unknown
  ) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    super(`Seq request failed (${status} ${statusText}) for ${endpoint}: ${details}`);
    this.name = "SeqHttpError";
    this.status = status;
    this.statusText = statusText;
    this.endpoint = endpoint;
    this.payload = payload;
  }
}

export class SeqNetworkError extends Error {
  public readonly endpoint: string;
  public readonly cause: unknown;

  public constructor(endpoint: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Seq network request failed for ${endpoint}: ${message}`);
    this.name = "SeqNetworkError";
    this.endpoint = endpoint;
    this.cause = cause;
  }
}

export class SeqClient {
  private readonly apiBase: URL;
  private readonly apiOrigin: string;
  private readonly apiBasePath: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  public constructor(config: ServerConfig) {
    this.apiBase = new URL(config.seqUrl);
    this.apiOrigin = this.apiBase.origin;
    this.apiBasePath = this.apiBase.pathname.replace(/\/+$/, "");
    this.apiKey = config.seqApiKey;
    this.timeoutMs = config.seqTimeoutMs;
  }

  public async get(options: SeqRequestOptions): Promise<unknown> {
    return this.request({ ...options, method: "GET" });
  }

  public async request(options: SeqRequestOptions): Promise<unknown> {
    const endpoint = this.resolveEndpoint(options.path);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        endpoint.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const method = options.method ?? "GET";
      const headers: Record<string, string> = {
        "X-Seq-ApiKey": this.apiKey,
        Accept: "application/json"
      };
      let requestPayload: string | undefined;

      if (options.body !== undefined) {
        headers["Content-Type"] = options.contentType ?? "application/json";
        requestPayload =
          headers["Content-Type"] === "application/json"
            ? JSON.stringify(options.body)
            : String(options.body);
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: requestPayload,
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new SeqHttpError(
          response.status,
          response.statusText,
          endpoint.pathname,
          payload
        );
      }

      return payload;
    } catch (error: unknown) {
      if (error instanceof SeqHttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new SeqNetworkError(endpoint.pathname, "Request timed out");
      }

      throw new SeqNetworkError(endpoint.pathname, error);
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveEndpoint(path: string): URL {
    if (path.startsWith("/")) {
      return new URL(path, this.apiOrigin);
    }

    let normalizedPath = path.replace(/^\/+/, "");
    if (this.apiBasePath.endsWith("/api")) {
      normalizedPath = normalizedPath.replace(/^api(?:\/|$)/i, "");
    }

    return new URL(
      normalizedPath,
      `${this.apiBase.toString().replace(/\/+$/, "")}/`
    );
  }
}
