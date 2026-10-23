import { SeqRequestValidationError } from "./seq-client.js";

export function validateQueryRange(from?: string, to?: string): void {
    for (const value of [from, to]) {
        if (
            value !== undefined &&
            (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
                value,
            ) ||
                !Number.isFinite(Date.parse(value)) ||
                new Date(value).toISOString().slice(0, 19) !==
                    value.slice(0, 19))
        ) {
            throw new SeqRequestValidationError(
                "api/data",
                "Time bounds must be valid ISO 8601 UTC timestamps ending in Z, with at most millisecond precision.",
            );
        }
    }
    if (from && to && Date.parse(from) >= Date.parse(to)) {
        throw new SeqRequestValidationError(
            "api/data",
            "fromDateUtc must be earlier than toDateUtc.",
        );
    }
}

export function limitQueryRows(value: unknown, count: number): unknown {
    if (
        typeof value !== "object" ||
        value === null ||
        !("Rows" in value) ||
        !Array.isArray(value.Rows) ||
        value.Rows.length <= count
    ) {
        return value;
    }
    return {
        ...value,
        Rows: value.Rows.slice(0, count),
        RowLimit: {
            complete: false,
            returnedRows: count,
            receivedRows: value.Rows.length,
            limit: count,
            remediation:
                "Narrow the query or use SQL limit/paging to obtain complete results. This client row limit does not bound server query work.",
        },
    };
}
