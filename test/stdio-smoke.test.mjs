import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import process from "node:process";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function startFakeSeqServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

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
            EventsResources: "api/events/resources"
          }
        })
      );
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
    async close() {
      server.close();
      await once(server, "close");
    }
  };
}

async function withClient(env, run) {
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
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: {},
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
