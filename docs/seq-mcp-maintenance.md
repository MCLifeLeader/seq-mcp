# Seq MCP Maintenance Guide

This document is the operational playbook for keeping this MCP server aligned with Seq API changes.

## Canonical Sources

Use these first-party references when checking for API additions/removals/behavior changes:

- Product/docs home: https://datalust.co/
- Seq docs home: https://docs.datalust.co/
- Server API endpoints table: https://docs.datalust.co/docs/server-http-api
- HTTP API usage guide: https://docs.datalust.co/docs/using-the-http-api
- API keys/permissions: https://docs.datalust.co/docs/api-keys

## What To Update When Seq Changes

When Seq adds/removes/changes endpoints or permissions, update all of the following:

- `src/route-catalog.ts`
- `docs/api-map.md`
- `src/index.ts` starter alias tools (`seq_starter_*`) if impacted
- `README.md` permissions/tool notes if behavior changed

## Standard Update Workflow

1. Confirm local configuration:
- Ensure `.env` has `SEQ_URL` and `SEQ_API_KEY`.
- Prefer `SEQ_URL` at host root (for example `http://localhost:10150`); `/api` is also supported.

2. Re-scan live API links from your Seq instance:
- Query `GET /api` and each `*/resources` link.
- Capture all `name -> route` links.

3. Re-scan official docs endpoint table:
- Parse `https://docs.datalust.co/docs/server-http-api`.
- Extract each `Path`, `HTTP method`, `Permission demand`, and notes.

4. Regenerate artifacts:
- Refresh `src/route-catalog.ts` from official route rows.
- Refresh `docs/api-map.md` from live + official data.

5. Reconcile behavior changes:
- Identify added, removed, or changed route+verb entries.
- Update starter aliases in `src/index.ts` for critical workflows.
- Verify permission handling remains graceful for `401/403`.

6. Validate build:
- `npm run check`
- `npm run build`

7. Smoke-test key tools:
- `seq_connection_test`
- `seq_starter_overview`
- `seq_api_catalog`
- `seq_api_live_links`
- one `seq_api_request` call against a known route

## Change Classification Rules

Use these rules during review:

- New route+verb in docs: add to `src/route-catalog.ts`; expose via generated tool set.
- Route removed from docs: remove from catalog; confirm no alias depends on it.
- Permission changed: update docs and verify error hints/remediation text.
- Parameter/template changes: verify route-template substitution and query handling.

## Prompt You Can Reuse

Use this with Codex to perform full sync updates quickly:

```text
Run the Seq MCP maintenance workflow from docs/seq-mcp-maintenance.md.
Re-scan live routes from my SEQ_URL and official endpoints from docs.datalust.co.
Regenerate docs/api-map.md and src/route-catalog.ts, then reconcile starter aliases and README.
Finally run npm run check and npm run build, and summarize added/removed/changed endpoints.
```

## Security Guardrails During Updates

- Never print or commit API keys.
- Keep `.env` ignored and `.env.example` generic.
- Use least-privilege keys for testing when possible.
- Keep write/admin route testing deliberate and explicit.
