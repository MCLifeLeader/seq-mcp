# mcp-seq-otel

Standalone MCP server that gives AI agents controlled API access to a user-owned Datalust Seq instance.

## What This Service Assumes

- You already run/manage your own Seq instance.
- This service only needs connection settings.

Required configuration:

- `SEQ_URL`
- `SEQ_API_KEY`

## URL Support

`SEQ_URL` accepts either:

- Host URL (recommended; service will append `/api`):
  - `http://localhost:10150`
  - `https://seq.example.com`
- Full API base URL (also supported):
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

Scope note:

- `seq_starter_*` tools are focused on common read workflows.
- `seq_api_request` and `seq_<verb>_<route>` expose the broader HTTP API surface from the Seq endpoint catalog, including non-`GET` routes.

## Seq API Key Permissions

Use least privilege based on the exact tools/workflows your MCP client will call.

Authoritative Datalust references:

- API keys and permission model: https://docs.datalust.co/docs/api-keys
- HTTP API usage guide: https://docs.datalust.co/docs/using-the-http-api
- Server endpoint + permission table: https://docs.datalust.co/docs/server-http-api

Recommended permission profiles:

- Read-focused starter usage (`seq_starter_*`, `seq_connection_test`, read-only queries): enable `Read`; disable `Ingest`, `Write`, `Project`, `Organization`, `System`.
- Full route-surface usage (`seq_api_request` and `seq_<verb>_<route>`): required permissions depend on the specific route+verb; check `seq_api_catalog` or the official endpoint table before granting.

Permission guidance for this project:

| Permission | Needed now | Why |
|---|---|---|
| `Read` | Yes | Required by starter query/retrieval workflows. |
| `Ingest` | Usually No | Needed only when calling ingestion routes such as `ingest/*` or `api/events/raw` when API-key-for-writing is required. |
| `Write` | Maybe | Needed for write routes (for example signals, dashboards, alerts, permalinks, SQL queries). |
| `Project` | Maybe | Needed for project-scoped administration and some settings/index routes. |
| `Organization` | Maybe | Needed for organization/user-management routes. |
| `System` | Maybe | Needed for system administration routes (for example apps, feeds, backups, updates). |

Starter endpoint mapping in current implementation:

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
- `403 Forbidden`: returns a permission-denied response with route-derived permission hints when available.
- Network/timeout failures: returns connectivity diagnostics for AI clients.

## Local Run (Node)

Node.js requirement: LTS (see `.nvmrc`).

```bash
npm install
npm run build
```

Windows PowerShell:

```powershell
$env:SEQ_URL = "http://localhost:10150"
$env:SEQ_API_KEY = "your-key"
node dist/index.js
```

## Docker Standalone Run

Docker Hub documentation assets in this repo:

- Auto-sync source for Hub long description: [`.dockerhub-readme.md`](.dockerhub-readme.md)
- Main project reference: [`README.md`](README.md)

Build image:

```bash
docker build -t mcp/seq-otel:latest .
```

Run via Docker Compose (recommended for MCP stdio):

PowerShell:

```powershell
./scripts/run-mcp-compose.ps1 -SeqUrl "http://localhost:10150" -SeqApiKey "<YOUR_SEQ_API_KEY>" -ImageTag latest -Build
```

Bash:

```bash
./scripts/run-mcp-compose.sh --seq-url "http://localhost:10150" --seq-api-key "<YOUR_SEQ_API_KEY>" --image-tag latest --build
```

Compose run behavior:

- Value precedence is: explicit script args -> existing environment variables -> `.env`.
- If the target `.env` is missing, scripts create a generic template `.env` automatically.
- When that generated generic template is in use, ensure `SEQ_URL` and `SEQ_API_KEY` are resolved via script args, existing environment variables, or a populated `.env` file.
- `MCP_IMAGE_TAG` precedence is: explicit `-ImageTag`/`--image-tag` -> existing environment -> `.env` -> `latest`.
- Scripts check image availability through compose service metadata and auto-build if the selected tag is not available.
- By default, no container name is specified, so Docker auto-generates a random name.
- You can override container name with `-ContainerName` (PowerShell) or `--container-name` (Bash).
- For security, prefer setting `SEQ_API_KEY` via environment variables or `.env` instead of CLI args.

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
./scripts/build-image.ps1 -Registry ghcr.io/mclifeleader -Tag v0.2.0 -Push
```

Bash:

```bash
./scripts/build-image.sh --registry ghcr.io/mclifeleader --tag v0.2.0 --push
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
  -e SEQ_URL=http://host.docker.internal:10150 \
  -e SEQ_API_KEY=your-key \
  mcp/seq-otel:latest
```

Run against FQDN Seq:

```bash
docker run --rm -i \
  -e SEQ_URL=https://seq.example.com \
  -e SEQ_API_KEY=your-key \
  mcp/seq-otel:latest
```

Run with Podman:

```bash
podman build -t mcp/seq-otel:latest .
podman run --rm -i \
  -e SEQ_URL=https://seq.example.com \
  -e SEQ_API_KEY=your-key \
  mcp/seq-otel:latest
```

The container startup contract requires both variables to be present:

- `SEQ_URL`
- `SEQ_API_KEY`

If either is missing, the container exits immediately with a clear startup error.

## Copy/Paste MCP Config (Codex and VS Code)

Assumes the image already exists (`mcp/seq-otel:latest`).

```json
{
  "mcpServers": {
    "seq-otel": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "SEQ_URL=http://host.docker.internal:10150",
        "-e",
        "SEQ_API_KEY=<YOUR_SEQ_API_KEY>",
        "mcp/seq-otel:latest"
      ]
    }
  }
}
```

## Docker MCP Catalog Compatibility

This repo includes a catalog-ready server definition in:

- `catalog/server.yaml`
- `catalog/tools.json`
- `assets/seq-otel-icon.svg`

`catalog/server.yaml` declares:

- `SEQ_URL` as a required user parameter (mapped via `config.env`)
- `SEQ_API_KEY` as a required secret (mapped via `config.secrets`)

These files follow the Docker MCP registry server format, so they can be used in
catalog generation/import workflows (for example via `docker/mcp-registry` tools).

Submission checklist for Docker MCP Registry:

- `docs/docker-mcp-registry-submission.md`

## MCP Client Integration Example

Use a command-based MCP client entry that launches the container with stdin/stdout attached.

```json
{
  "mcpServers": {
    "seq-otel": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "SEQ_URL=https://seq.example.com",
        "-e",
        "SEQ_API_KEY=<YOUR_SEQ_API_KEY>",
        "mcp/seq-otel:latest"
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
