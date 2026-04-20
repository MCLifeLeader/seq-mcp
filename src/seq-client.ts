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

export class SeqRequestValidationError extends Error {
  public readonly endpoint: string;

  public constructor(endpoint: string, message: string) {
    super(message);
    this.name = "SeqRequestValidationError";
    this.endpoint = endpoint;
  }
}

export class SeqResponseTooLargeError extends Error {
  public readonly endpoint: string;
  public readonly responseBytes: number;
  public readonly maxResponseBytes: number;

  public constructor(
    endpoint: string,
    responseBytes: number,
    maxResponseBytes: number
  ) {
    super(
      `Seq response exceeded ${maxResponseBytes} bytes for ${endpoint} (${responseBytes} bytes).`
    );
    this.name = "SeqResponseTooLargeError";
    this.endpoint = endpoint;
    this.responseBytes = responseBytes;
    this.maxResponseBytes = maxResponseBytes;
  }
}

export class SeqClient {
  private readonly apiBase: URL;
  private readonly apiOrigin: string;
  private readonly apiBasePath: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRequestBytes: number;
  private readonly maxResponseBytes: number;

  public constructor(config: ServerConfig) {
    this.apiBase = new URL(config.seqUrl);
    this.apiOrigin = this.apiBase.origin;
    this.apiBasePath = this.apiBase.pathname.replace(/\/+$/, "");
    this.apiKey = config.seqApiKey;
    this.timeoutMs = config.seqTimeoutMs;
    this.maxRequestBytes = config.seqMaxRequestBytes;
    this.maxResponseBytes = config.seqMaxResponseBytes;
  }

  public getApiBaseUrl(): string {
    return this.apiBase.toString().replace(/\/+$/, "");
  }

  public getHealthUrl(): string {
    return new URL("/health", `${this.apiOrigin}/`).toString();
  }

  public async getHealth(): Promise<unknown> {
    return this.sendRequest(new URL("/health", `${this.apiOrigin}/`), {
      method: "GET"
    });
  }

  public async get(options: SeqRequestOptions): Promise<unknown> {
    return this.request({ ...options, method: "GET" });
  }

  public async request(options: SeqRequestOptions): Promise<unknown> {
    const endpoint = this.resolveEndpoint(options.path);

    return this.sendRequest(endpoint, options);
  }

  private async sendRequest(
    endpoint: URL,
    options: Omit<SeqRequestOptions, "path"> & { path?: string }
  ): Promise<unknown> {
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

        const requestBytes = Buffer.byteLength(requestPayload);
        if (requestBytes > this.maxRequestBytes) {
          throw new SeqRequestValidationError(
            endpoint.pathname,
            `Request body exceeds ${this.maxRequestBytes} bytes.`
          );
        }
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: requestPayload,
        signal: controller.signal
      });

      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        const parsedContentLength = Number.parseInt(contentLength, 10);
        if (
          Number.isFinite(parsedContentLength) &&
          parsedContentLength > this.maxResponseBytes
        ) {
          throw new SeqResponseTooLargeError(
            endpoint.pathname,
            parsedContentLength,
            this.maxResponseBytes
          );
        }
      }

      const payloadBytes = Buffer.from(await response.arrayBuffer());
      if (payloadBytes.byteLength > this.maxResponseBytes) {
        throw new SeqResponseTooLargeError(
          endpoint.pathname,
          payloadBytes.byteLength,
          this.maxResponseBytes
        );
      }

      const payload = this.parsePayload(
        response.headers.get("content-type") ?? "application/octet-stream",
        payloadBytes
      );

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
      if (
        error instanceof SeqHttpError ||
        error instanceof SeqRequestValidationError ||
        error instanceof SeqResponseTooLargeError
      ) {
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

  private parsePayload(contentType: string, payloadBytes: Buffer): unknown {
    if (payloadBytes.byteLength === 0) {
      return null;
    }

    if (contentType.includes("json")) {
      const text = payloadBytes.toString("utf8");

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    if (
      contentType.startsWith("text/") ||
      contentType.includes("xml") ||
      contentType.includes("javascript")
    ) {
      return payloadBytes.toString("utf8");
    }

    return {
      contentType,
      byteLength: payloadBytes.byteLength,
      base64: payloadBytes.toString("base64")
    };
  }
}
