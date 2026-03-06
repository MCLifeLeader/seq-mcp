# Seq API Map (Practical Summary)

This document is intentionally concise. It highlights what matters for day-to-day use of this MCP server without duplicating the full endpoint catalog.

## Canonical Sources

- Implementation catalog: `src/route-catalog.ts`
- Runtime catalog tool: `seq_api_catalog`
- Official Seq endpoint table: https://docs.datalust.co/docs/server-http-api
- HTTP API usage guidance: https://docs.datalust.co/docs/using-the-http-api

If this file conflicts with generated/catalog data, treat `src/route-catalog.ts` as authoritative.

## Current Snapshot

Source: `src/route-catalog.ts`

- Total route+verb entries: `210`
- API shape is read-heavy (`GET`, `Public`, and `Read` dominate)

### Method Distribution

| Method | Count |
|---|---:|
| GET | 135 |
| POST | 33 |
| PUT | 24 |
| DELETE | 18 |

### Permission Distribution

| Permission | Count |
|---|---:|
| System | 51 |
| Public | 49 |
| Read | 46 |
| Write | 33 |
| Project | 22 |
| Organization | 9 |

## Important Route Families

| Family | Why It Matters | Typical Permission |
|---|---|---|
| `events` | Core search/scan/stream workflows | `Read` |
| `data` | Query execution used by starter flows | `Read` |
| `signals` | Signal create/read/update/delete | `Read`, `Write` |
| `dashboards` | Dashboard create/read/update/delete | `Read`, `Write` |
| `workspaces` | Workspace create/read/update/delete | `Read`, `Write` |
| `diagnostics` | Operational health and diagnostics | `Read`, `Project`, `System` |
| `settings` | Mixed public/system/org configuration | `Public`, `System`, `Organization` |
| `users` | Identity and user-management surface | `Read`, `Write`, `Project`, `Organization`, `System` |
| `ingest/*` | Log/OTLP ingestion endpoints | `Public` plus ingestion policy constraints |

## Permission Strategy

- Start with least privilege (`Read`) for discovery and querying workflows.
- Add `Write` only when invoking explicit mutation routes.
- Treat `Project`, `Organization`, and `System` as elevated scopes; grant per workflow, not by default.
- Validate route-level permission requirements with `seq_api_catalog` before widening access.

## Quick Validation Path

Use this order when verifying a target Seq instance:

1. `seq_connection_test`
2. `seq_api_catalog`
3. `seq_api_live_links`
4. `seq_api_request` against one known safe route (for example `GET /api/events/resources`)
