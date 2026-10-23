import test from "node:test";
import assert from "node:assert/strict";
import { formatJsonOutput } from "../dist/format.js";

test("oversized evidence returns valid JSON and explicitly omits incomplete data", () => {
    const result = formatJsonOutput({
        Rows: [["sensitive-event".repeat(2000)]],
    });
    const payload = JSON.parse(result.text);
    assert.equal(result.truncated, true);
    assert.equal(payload.complete, false);
    assert.equal(payload.dataOmitted, true);
    assert.equal(payload.originalChars > payload.maxChars, true);
    assert.ok(payload.remediation.length);
    assert.equal(result.text.includes("sensitive-event"), false);
});

test("complete output retains the original JSON contract", () => {
    assert.deepEqual(formatJsonOutput({ Rows: [[42]] }), {
        text: JSON.stringify({ Rows: [[42]] }, null, 2),
        truncated: false,
    });
});
