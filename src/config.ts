import { z } from "zod";

const configSchema = z.object({
  seqUrl: z.string().url(),
  seqApiKey: z.string().min(1),
  seqTimeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
  seqMaxRequestBytes: z.number().int().min(128).max(1_048_576).default(262_144),
  seqMaxResponseBytes: z.number().int().min(128).max(8_388_608).default(1_048_576)
});

export type ServerConfig = z.infer<typeof configSchema>;

function parseOptionalInteger(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeSeqApiBase(rawUrl: string): string {
  const url = new URL(rawUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname === "") {
    url.pathname = "/api";
  } else if (!pathname.endsWith("/api")) {
    url.pathname = `${pathname}/api`;
  }

  return url.toString().replace(/\/+$/, "");
}

export function loadConfig(): ServerConfig {
  const seqUrl = process.env.SEQ_URL;
  const seqApiKey = process.env.SEQ_API_KEY;
  const timeoutRaw = parseOptionalInteger(process.env.SEQ_TIMEOUT_MS);
  const maxRequestBytesRaw = parseOptionalInteger(process.env.SEQ_MAX_REQUEST_BYTES);
  const maxResponseBytesRaw = parseOptionalInteger(process.env.SEQ_MAX_RESPONSE_BYTES);

  const parsed = configSchema.safeParse({
    seqUrl: seqUrl,
    seqApiKey: seqApiKey,
    seqTimeoutMs: timeoutRaw ?? 30_000,
    seqMaxRequestBytes: maxRequestBytesRaw ?? 262_144,
    seqMaxResponseBytes: maxResponseBytesRaw ?? 1_048_576
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");

    throw new Error(
      "Invalid configuration. Required: SEQ_URL and SEQ_API_KEY. Optional limits: SEQ_TIMEOUT_MS, SEQ_MAX_REQUEST_BYTES, SEQ_MAX_RESPONSE_BYTES. " +
        `Details: ${details}`
    );
  }

  return {
    ...parsed.data,
    seqUrl: normalizeSeqApiBase(parsed.data.seqUrl)
  };
}
