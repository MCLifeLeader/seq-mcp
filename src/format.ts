export function formatJson(value: unknown, maxChars = 16_000): string {
  const serialized = JSON.stringify(value, null, 2);

  if (serialized.length <= maxChars) {
    return serialized;
  }

  return `${serialized.slice(0, maxChars)}\n... output truncated ...`;
}
