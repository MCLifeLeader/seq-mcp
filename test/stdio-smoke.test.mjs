import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import process from "node:process";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function startFakeSeqServer() {
  const requests = [];

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(bodyChunks);
    requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: body.toString("utf8")
    });

    if (request.headers["x-seq-apikey"] !== "test-api-key") {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          status: "healthy",
          description: "Fake Seq health endpoint"
        })
      );
      return;
    }

    if (url.pathname === "/api" || url.pathname === "/api/") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          Product: "Seq",
          Version: "test",
          Links: {
            EventsResources: "api/events/resources",
            AppsResources: "api/apps/resources",
            SettingsResources: "api/settings/resources"
          }
        })
      );
      return;
    }

    if (url.pathname === "/api/events/resources") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          Links: {
            Self: "api/events/resources"
          }
        })
      );
      return;
    }

    if (url.pathname === "/api/data" && request.method === "POST") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          accepted: true,
          query: Object.fromEntries(url.searchParams.entries()),
          body: body.length > 0 ? JSON.parse(body.toString("utf8")) : null
        })
      );
      return;
    }

    if (url.pathname === "/api/events/event-1") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          Id: "event-1",
          MessageTemplate: "hello world"
        })
      );
      return;
    }

    if (url.pathname === "/api/events/large-event") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          Id: "large-event",
          Payload: "x".repeat(512)
        })
      );
      return;
    }

    if (url.pathname === "/api/apps/app-1/icon") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return;
    }

    if (url.pathname === "/api/settings/setting-minimumfreestoragespace") {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "forbidden" }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not found", path: url.pathname }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert(address && typeof address === "object");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      server.close();
      await once(server, "close");
    }
  };
}

async function withClient(env, run) {
  const mergedEnv = {
    ...process.env,
    ...env
  };

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: mergedEnv,
    stderr: "pipe",
    cwd: process.cwd()
  });

  const stderrChunks = [];
  transport.stderr?.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  const client = new Client({
    name: "stdio-smoke-test",
    version: "0.0.0"
  });

  try {
    await client.connect(transport);
    return await run(client, () => stderrChunks.join(""));
  } finally {
    await client.close();
  }
}

test("stdio MCP server initializes and answers seq_connection_test", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: fakeSeq.baseUrl,
        SEQ_API_KEY: "test-api-key"
      },
      async (client, getStderr) => {
        const tools = await client.listTools();
        assert(tools.tools.some((tool) => tool.name === "seq_connection_test"));

        const result = await client.callTool({
          name: "seq_connection_test",
          arguments: {
            includeApiInfo: true
          }
        });

        assert.equal(result.isError, undefined);
        assert.equal(result.content.length, 1);

        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.seqApiBase, `${fakeSeq.baseUrl}/api`);
        assert.equal(payload.seqHealthUrl, `${fakeSeq.baseUrl}/health`);
        assert.deepEqual(payload.health, {
          status: "healthy",
          description: "Fake Seq health endpoint"
        });
        assert.equal(payload.api.Product, "Seq");
        assert.equal(getStderr(), "");
      }
    );
  } finally {
    await fakeSeq.close();
  }
});

test("stdio MCP server resolves health from the Seq host root when SEQ_URL includes /api", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: `${fakeSeq.baseUrl}/api`,
        SEQ_API_KEY: "test-api-key"
      },
      async (client) => {
        const result = await client.callTool({
          name: "seq_connection_test",
          arguments: {
            includeApiInfo: false
          }
        });

        assert.equal(result.isError, undefined);

        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.seqApiBase, `${fakeSeq.baseUrl}/api`);
        assert.equal(payload.seqHealthUrl, `${fakeSeq.baseUrl}/health`);
        assert.deepEqual(payload.health, {
          status: "healthy",
          description: "Fake Seq health endpoint"
        });
      }
    );
  } finally {
    await fakeSeq.close();
  }
});

test("stdio MCP server fails fast with actionable stderr when config is missing", async () => {
  const env = { ...process.env };
  delete env.SEQ_URL;
  delete env.SEQ_API_KEY;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env,
    stderr: "pipe",
    cwd: process.cwd()
  });

  const stderrChunks = [];
  transport.stderr?.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  const client = new Client({
    name: "stdio-startup-failure-test",
    version: "0.0.0"
  });

  await assert.rejects(
    () => client.connect(transport),
    /closed|Invalid configuration/i
  );

  await client.close();

  const stderr = stderrChunks.join("");
  assert.match(stderr, /Invalid configuration/);
  assert.match(stderr, /SEQ_URL/);
  assert.match(stderr, /SEQ_API_KEY/);
});

test("seq_api_request only allows official catalog routes", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: fakeSeq.baseUrl,
        SEQ_API_KEY: "test-api-key"
      },
      async (client) => {
        const result = await client.callTool({
          name: "seq_api_request",
          arguments: {
            method: "GET",
            path: "api/not-real"
          }
        });

        assert.equal(result.isError, true);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.error, "Invalid Seq API request.");
        assert.match(payload.detail, /Unsupported Seq route/);
        assert.equal(fakeSeq.requests.length, 0);
      }
    );
  } finally {
    await fakeSeq.close();
  }
});

test("seq_api_request forwards cataloged POST bodies to Seq", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: fakeSeq.baseUrl,
        SEQ_API_KEY: "test-api-key"
      },
      async (client) => {
        const result = await client.callTool({
          name: "seq_api_request",
          arguments: {
            method: "POST",
            path: "api/data",
            body: {
              q: "select *",
              count: 10
            }
          }
        });

        assert.equal(result.isError, undefined);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.permission, "Read");
        assert.deepEqual(payload.response.body, {
          q: "select *",
          count: 10
        });
        assert.equal(fakeSeq.requests.at(-1)?.path, "/api/data");
      }
    );
  } finally {
    await fakeSeq.close();
  }
});

test("binary Seq responses are returned as structured payloads", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: fakeSeq.baseUrl,
        SEQ_API_KEY: "test-api-key"
      },
      async (client) => {
        const result = await client.callTool({
          name: "seq_get_api_apps_by_icon",
          arguments: {
            pathParams: {
              id: "app-1"
            }
          }
        });

        assert.equal(result.isError, undefined);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.response.contentType, "image/png");
        assert.equal(payload.response.byteLength, 4);
        assert.equal(payload.response.base64, "iVBORw==");
      }
    );
  } finally {
    await fakeSeq.close();
  }
});

test("permission failures include the catalog permission hint", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: fakeSeq.baseUrl,
        SEQ_API_KEY: "test-api-key"
      },
      async (client) => {
        const result = await client.callTool({
          name: "seq_get_api_settings_setting_minimumfreestoragespace",
          arguments: {}
        });

        assert.equal(result.isError, true);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.error, "Permission denied by Seq API.");
        assert.equal(payload.requiredPermission, "System");
      }
    );
  } finally {
    await fakeSeq.close();
  }
});

test("oversized responses fail gracefully with limit guidance", async () => {
  const fakeSeq = await startFakeSeqServer();

  try {
    await withClient(
      {
        SEQ_URL: fakeSeq.baseUrl,
        SEQ_API_KEY: "test-api-key",
        SEQ_MAX_RESPONSE_BYTES: "128"
      },
      async (client) => {
        const result = await client.callTool({
          name: "seq_starter_event_by_id",
          arguments: {
            id: "large-event"
          }
        });

        assert.equal(result.isError, true);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(
          payload.error,
          "Seq API response exceeded the configured size limit."
        );
        assert.equal(payload.maxResponseBytes, 128);
      }
    );
  } finally {
    await fakeSeq.close();
  }
});
