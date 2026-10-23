export function formatJsonOutput(
    value: unknown,
    maxChars = 16_000,
): { text: string; truncated: boolean } {
    const serialized = JSON.stringify(value, null, 2);

    if (serialized.length <= maxChars) {
        return { text: serialized, truncated: false };
    }

    return {
        truncated: true,
        text: JSON.stringify(
            {
                error: "Seq tool response exceeds the display limit.",
                complete: false,
                dataOmitted: true,
                originalChars: serialized.length,
                maxChars,
                remediation: [
                    "Narrow the time range, query projection, or resource scope and retry.",
                    "Use smaller pages where the endpoint supports paging; do not treat this response as complete evidence.",
                ],
            },
            null,
            2,
        ),
    };
}

export function formatJson(value: unknown, maxChars = 16_000): string {
    return formatJsonOutput(value, maxChars).text;
}
