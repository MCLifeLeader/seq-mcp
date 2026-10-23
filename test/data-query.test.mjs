import test from "node:test";
import assert from "node:assert/strict";
import { limitQueryRows, validateQueryRange } from "../dist/data-query.js";

test("data queries reject malformed or reversed time bounds", () => {
    for (const [from, to] of [
        ["yesterday", undefined],
        ["2026-02-30T00:00:00Z", undefined],
        ["2026-10-23T00:00:00.0001Z", undefined],
        ["2026-10-23T04:00:00Z", "2026-10-23T03:00:00Z"],
    ]) {
        assert.throws(() => validateQueryRange(from, to));
    }
    assert.doesNotThrow(() =>
        validateQueryRange("2026-10-23T03:00:00Z", "2026-10-23T04:00:00Z"),
    );
});

test("data query client row cap preserves columns and declares incomplete rows", () => {
    const value = {
        Columns: ["Count"],
        Rows: [[1], [2], [3]],
        Statistics: { ElapsedMilliseconds: 1 },
    };
    const result = limitQueryRows(value, 2);
    assert.deepEqual(result.Rows, [[1], [2]]);
    assert.deepEqual(result.Columns, value.Columns);
    assert.equal(result.RowLimit.complete, false);
    assert.equal(result.RowLimit.receivedRows, 3);
    assert.equal(result.RowLimit.returnedRows, 2);
    assert.equal(value.Rows.length, 3);
    assert.equal(limitQueryRows(value, 3), value);
});
