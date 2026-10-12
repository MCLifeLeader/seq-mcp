import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadIdleTimeoutMs } from "../dist/idle-lifetime.js";

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
        const exit = new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Idle server did not exit")),
                5000,
            );
            child.once("error", reject);
            child.once("close", (code, signal) => {
                clearTimeout(timer);
                resolve({ code, signal });
            });
        });
        assert.deepEqual(await exit, { code: 0, signal: null });
    } finally {
        child.kill();
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
            if (!closed) await ttl().catch(() => {});
        }
        assert(closed, "Repeated TTL polling must not prevent shutdown");
    } finally {
        await client.close();
    }
});
