# Source Code

Current implementation:

- `src/index.ts`: MCP server entrypoint and tool definitions.
- `src/config.ts`: environment configuration parsing/validation.
- `src/seq-client.ts`: authenticated Seq HTTP client.
- `src/route-catalog.ts`: official Seq route/verb/permission catalog.
- `src/format.ts`: safe response formatting/truncation.

This service is intentionally standalone and expects an existing Seq instance.
