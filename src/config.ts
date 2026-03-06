import { z } from "zod";

const configSchema = z.object({
  seqUrl: z.string().url(),
  seqApiKey: z.string().min(1),
  seqTimeoutMs: z.number().int().positive().default(30_000)
});

export type ServerConfig = z.infer<typeof configSchema>;

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
  const timeoutRaw = process.env.SEQ_TIMEOUT_MS;

  const parsed = configSchema.safeParse({
    seqUrl: seqUrl,
    seqApiKey: seqApiKey,
    seqTimeoutMs: timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 30_000
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");

    throw new Error(
      `Invalid configuration. Required: SEQ_URL and SEQ_API_KEY. Details: ${details}`
    );
  }

  return {
    ...parsed.data,
    seqUrl: normalizeSeqApiBase(parsed.data.seqUrl)
  };
}
