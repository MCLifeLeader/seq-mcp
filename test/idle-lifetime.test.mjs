import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { IdleLifetime, loadIdleTimeoutMs } from "../dist/idle-lifetime.js";

test("idle timer resets its deadline and expires exactly once", (t) => {
    let elapsed = 0;
    t.mock.method(performance, "now", () => elapsed);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let expirations = 0;
    const lifetime = new IdleLifetime(1000, () => expirations++);
    assert.deepEqual(lifetime.status(), {
        idleTimeoutMs: 1000,
        remainingMs: 1000,
    });
    elapsed = 400;
    t.mock.timers.tick(400);
    assert.equal(lifetime.status().remainingMs, 600);
    lifetime.reset();
    assert.equal(lifetime.status().remainingMs, 1000);
    elapsed = 1000;
    t.mock.timers.tick(600);
    assert.equal(expirations, 0, "Original timer must be cancelled");
    elapsed = 1400;
    t.mock.timers.tick(400);
    assert.equal(expirations, 1);
    assert.equal(lifetime.status().remainingMs, 0);
    elapsed = 2400;
    t.mock.timers.tick(1000);
    assert.equal(expirations, 1);
    assert.equal(lifetime.status().remainingMs, 0);
});

test("stopping the idle timer prevents expiry", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let expirations = 0;
    const lifetime = new IdleLifetime(1000, () => expirations++);
    lifetime.stop();
    lifetime.stop();
    t.mock.timers.tick(5000);
    assert.equal(expirations, 0);
});

function childExit(child, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            child.off("error", onError);
            child.off("close", onClose);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const onClose = (code, signal) => {
            cleanup();
            resolve({ code, signal });
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Server did not exit before the test deadline"));
        }, timeoutMs);
        child.once("error", onError);
        child.once("close", onClose);
    });
}

test("idle timeout defaults to 15 minutes and strictly validates overrides", () => {
    const original = process.env.MCP_IDLE_TIMEOUT_MS;
    try {
        delete process.env.MCP_IDLE_TIMEOUT_MS;
        assert.equal(loadIdleTimeoutMs(), 900_000);
        for (const invalid of ["", "0", "-1", "1.5", "1000ms", "2147483648"]) {
            process.env.MCP_IDLE_TIMEOUT_MS = invalid;
            assert.throws(loadIdleTimeoutMs, /Invalid MCP_IDLE_TIMEOUT_MS/);
        }
        process.env.MCP_IDLE_TIMEOUT_MS = "1234";
        assert.equal(loadIdleTimeoutMs(), 1234);
        for (const boundary of ["1", "2147483647"]) {
            process.env.MCP_IDLE_TIMEOUT_MS = boundary;
            assert.equal(loadIdleTimeoutMs(), Number(boundary));
        }
    } finally {
        if (original === undefined) delete process.env.MCP_IDLE_TIMEOUT_MS;
        else process.env.MCP_IDLE_TIMEOUT_MS = original;
    }
});

test("idle server exits successfully even when stdin remains open", async () => {
    const child = spawn(process.execPath, ["dist/index.js"], {
        env: {
            ...process.env,
            SEQ_URL: "http://127.0.0.1:65535",
            SEQ_API_KEY: "test",
            MCP_IDLE_TIMEOUT_MS: "200",
        },
        stdio: ["pipe", "pipe", "pipe"],
    });
    try {
        assert.deepEqual(await childExit(child), { code: 0, signal: null });
    } finally {
        child.kill();
    }
});

test("invalid idle configuration fails at startup with an actionable error", async () => {
    const child = spawn(process.execPath, ["dist/index.js"], {
        env: {
            ...process.env,
            SEQ_URL: "http://127.0.0.1:65535",
            SEQ_API_KEY: "test",
            MCP_IDLE_TIMEOUT_MS: "15minutes",
        },
        stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
        stderr += chunk;
    });
    try {
        assert.deepEqual(await childExit(child), { code: 1, signal: null });
        assert.match(stderr, /Invalid MCP_IDLE_TIMEOUT_MS/);
    } finally {
        child.kill();
    }
});

test("idle expiry terminates an outstanding Seq request without waiting for its timeout", async () => {
    const fakeSeq = http.createServer(() => {
        /* Deliberately leave the response pending. */
    });
    fakeSeq.listen(0, "127.0.0.1");
    await once(fakeSeq, "listening");
    const address = fakeSeq.address();
    assert(address && typeof address === "object");
    const child = spawn(process.execPath, ["dist/index.js"], {
        env: {
            ...process.env,
            SEQ_URL: `http://127.0.0.1:${address.port}`,
            SEQ_API_KEY: "test",
            SEQ_TIMEOUT_MS: "30000",
            MCP_IDLE_TIMEOUT_MS: "1000",
        },
        stdio: ["pipe", "pipe", "pipe"],
    });
    try {
        const initialized = once(child.stdout, "data", {
            signal: AbortSignal.timeout(5000),
        });
        child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "pending-request-test", version: "1" } } })}\n`,
        );
        await initialized;
        const received = once(fakeSeq, "request", {
            signal: AbortSignal.timeout(5000),
        });
        child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
        );
        child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "seq_starter_event_by_id", arguments: { id: "pending" } } })}\n`,
        );
        await received;
        assert.deepEqual(await childExit(child), { code: 0, signal: null });
    } finally {
        child.kill();
        fakeSeq.closeAllConnections();
        await new Promise((resolve) => fakeSeq.close(resolve));
    }
});

test("TTL queries do not extend lifetime; keep alive and other requests reset it", async () => {
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["dist/index.js"],
        env: {
            ...process.env,
            SEQ_URL: "http://127.0.0.1:65535",
            SEQ_API_KEY: "test",
            MCP_IDLE_TIMEOUT_MS: "1500",
        },
        stderr: "pipe",
    });
    const client = new Client({ name: "idle-test", version: "1" });
    const ttl = async () =>
        JSON.parse(
            (await client.callTool({ name: "seq_server_ttl", arguments: {} }))
                .content[0].text,
        );
    try {
        await client.connect(transport);
        const advertised = (await client.listTools()).tools;
        const catalog = JSON.parse(
            await readFile(
                new URL("../catalog/tools.json", import.meta.url),
                "utf8",
            ),
        );
        // The published catalog is a curated subset; generated Seq route aliases
        // are also advertised at runtime.
        for (const tool of catalog) {
            assert(
                advertised.some((candidate) => candidate.name === tool.name),
            );
        }
        for (const name of ["seq_server_ttl", "seq_server_keep_alive"]) {
            assert.equal(
                advertised.find((tool) => tool.name === name).description,
                catalog.find((tool) => tool.name === name).description,
            );
        }
        const first = await ttl();
        assert.equal(first.idleTimeoutMs, 1500);
        await delay(200);
        const second = await ttl();
        assert(second.remainingMs < first.remainingMs - 100);
        const alive = JSON.parse(
            (
                await client.callTool({
                    name: "seq_server_keep_alive",
                    arguments: {},
                })
            ).content[0].text,
        );
        assert(alive.remainingMs > second.remainingMs + 100);
        await delay(200);
        await client.listTools();
        assert((await ttl()).remainingMs > second.remainingMs + 100);
        await delay(200);
        await client.ping();
        assert((await ttl()).remainingMs > second.remainingMs + 100);
        await delay(200);
        // Even a failed Seq call is activity.
        const failed = await client.callTool({
            name: "seq_starter_event_by_id",
            arguments: { id: "missing" },
        });
        assert.equal(failed.isError, true);
        assert((await ttl()).remainingMs > second.remainingMs + 100);
        let closed = false;
        client.onclose = () => {
            closed = true;
        };
        const deadline = Date.now() + 3000;
        while (!closed && Date.now() < deadline) {
            await delay(100);
            if (!closed) {
                // Notifications must not keep the process alive either.
                await transport
                    .send({
                        jsonrpc: "2.0",
                        method: "notifications/cancelled",
                        params: { requestId: "absent" },
                    })
                    .catch(() => {});
                await ttl().catch(() => {});
            }
        }
        assert(closed, "Repeated TTL polling must not prevent shutdown");
    } finally {
        await client.close();
    }
});
