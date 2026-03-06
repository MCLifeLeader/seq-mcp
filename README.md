# seq-mcp

Standalone MCP server that gives AI agents controlled read access to a user-owned Datalust Seq instance.

## What This Service Assumes

- You already run/manage your own Seq instance.
- This service only needs connection settings.

Required configuration:

- `SEQ_URL`
- `SEQ_API_KEY`

## URL Support

`SEQ_URL` accepts either:

- Host URL (service will append `/api`):
  - `http://localhost:10150`
  - `https://seq.example.com`
- Full API base URL:
  - `http://localhost:10150/api`
  - `https://seq.example.com/api`

## Available MCP Tools

- `seq_connection_test`: validates Seq connectivity and API reachability.
- `seq_starter_help`: lists the compact starter alias tools.
- `seq_starter_overview`: quick health, user, diagnostics, signals, and workspace summary.
- `seq_starter_events_search`: common event search by filter/signal/time range.
- `seq_starter_event_by_id`: fetch one event by id.
- `seq_starter_data_query`: run a `q` query using `GET` or `POST`.
- `seq_starter_signals_list` / `seq_starter_signal_by_id`: signal discovery helpers.
- `seq_starter_dashboards_list`: list dashboards.
- `seq_starter_alerts_list`: list alerts.
- `seq_starter_events_stream`: bounded live-tail style stream call.
- `seq_api_catalog`: returns the full official Seq route/verb/permission catalog.
- `seq_api_live_links`: discovers live `name -> route` links from your Seq instance.
- `seq_api_request`: generic verb/path invoker for any Seq API route.
- `seq_<verb>_<route>`: auto-generated tool per official route+verb (from docs).

## Seq API Key Permissions

Based on current Seq documentation, this MCP server should run with least privilege.

Recommended API key permission selection:

- `Read`: enable
- `Ingest`: disable
- `Write`: disable
- `Project`: disable
- `Organization`: disable
- `System`: disable

Permission guidance for this project:

| Permission | Needed now | Why |
|---|---|---|
| `Read` | Yes | Required for querying and retrieving events/data. |
| `Ingest` | No | This MCP server does not write new events to Seq. |
| `Write` | No | This MCP server does not modify Seq resources. |
| `Project` | No | No project administration features are implemented. |
| `Organization` | No | No org-level administration features are implemented. |
| `System` | No | No system administration endpoints are used. |

Endpoint mapping in current implementation:

- `GET /health`: public endpoint.
- `GET /api/events/resources`: public endpoint.
- `GET /api/events`: `Read` permission demand.
- `GET /api/events/{id}`: `Read` permission demand.
- `GET /api/data`: `Read` permission demand.

## API Key Header

The server authenticates to Seq using the `X-Seq-ApiKey` header.

## Resilience and Permission Handling

Tool failures are returned as structured MCP error responses (`isError: true`) instead of crashing the server process.

Current graceful handling includes:

- `401 Unauthorized`: returns guidance to verify `SEQ_API_KEY` and `SEQ_URL`.
- `403 Forbidden`: returns a permission-denied response with required permission hints (currently `Read`).
- Network/timeout failures: returns connectivity diagnostics for AI clients.

## Local Run (Node)

```bash
npm install
npm run build
```

Windows PowerShell:

```powershell
$env:SEQ_URL = "http://localhost:10150/api"
$env:SEQ_API_KEY = "your-key"
node dist/index.js
```

## Docker Standalone Run

Docker Hub documentation assets in this repo:

- Auto-sync source for Hub long description: [`.dockerhub-readme.md`](.dockerhub-readme.md)
- Main project reference: [`README.md`](README.md)

Build image:

```bash
docker build -t mcp/seq-otel:local .
```

Or use helper scripts:

PowerShell:

```powershell
./scripts/build-image.ps1
```

Bash:

```bash
./scripts/build-image.sh
```

Build and push to registry (pullable by other Docker hosts):

PowerShell:

```powershell
./scripts/build-image.ps1 -Registry ghcr.io/your-org -Tag v0.2.0 -Push
```

Bash:

```bash
./scripts/build-image.sh --registry ghcr.io/your-org --tag v0.2.0 --push
```

Build and export tar (loadable with `docker load`):

PowerShell:

```powershell
./scripts/build-image.ps1 -SaveTar ./mcp-seq-otel.tar
```

Bash:

```bash
./scripts/build-image.sh --save-tar ./mcp-seq-otel.tar
```

Run against local Seq:

```bash
docker run --rm -i \
  -e SEQ_URL=http://host.docker.internal:10150/api \
  -e SEQ_API_KEY=your-key \
  mcp/seq-otel:local
```

Run against FQDN Seq:

```bash
docker run --rm -i \
  -e SEQ_URL=https://seq.example.com/api \
  -e SEQ_API_KEY=your-key \
  mcp/seq-otel:local
```

Run with Podman:

```bash
podman build -t mcp/seq-otel:local .
podman run --rm -i \
  -e SEQ_URL=https://seq.example.com/api \
  -e SEQ_API_KEY=your-key \
  mcp/seq-otel:local
```

The container startup contract requires both variables to be present:

- `SEQ_URL`
- `SEQ_API_KEY`

If either is missing, the container exits immediately with a clear startup error.

## Docker MCP Catalog Compatibility

This repo includes a catalog-ready server definition in:

- `catalog/server.yaml`
- `catalog/tools.json`

`catalog/server.yaml` declares:

- `SEQ_URL` as a required user parameter (mapped via `config.env`)
- `SEQ_API_KEY` as a required secret (mapped via `config.secrets`)

These files follow the Docker MCP registry server format, so they can be used in
catalog generation/import workflows (for example via `docker/mcp-registry` tools).

## MCP Client Integration Example

Use a command-based MCP client entry that launches the container with stdin/stdout attached.

```json
{
  "mcpServers": {
    "seq": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "SEQ_URL=https://seq.example.com/api",
        "-e",
        "SEQ_API_KEY=${SEQ_API_KEY}",
        "mcp/seq-otel:local"
      ]
    }
  }
}
```

## Security Notes

- Do not commit keys.
- Use least-privilege Seq API keys.
- Prefer HTTPS for non-local Seq instances.

## API Mapping Artifact

- Full generated API map: [`docs/api-map.md`](docs/api-map.md)
- Maintenance/update playbook: [`docs/seq-mcp-maintenance.md`](docs/seq-mcp-maintenance.md)
- Project skill for update workflows: [`.github/skills/seq-mcp-maintainer/SKILL.md`](.github/skills/seq-mcp-maintainer/SKILL.md)

## Status

Core standalone server scaffold is implemented and buildable.
