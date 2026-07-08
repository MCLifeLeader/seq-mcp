# mcp-seq-otlp

Standalone MCP server that gives AI agents controlled API access to a user-owned Datalust Seq instance.

## Official Seq API Docs

- Official Seq HTTP API usage guide: [Using the HTTP API](https://datalust.co/docs/using-the-http-api)

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

- `seq_agent_guide`: returns agent-focused tool selection rules, recommended workflows, examples, and safety limits.
- `seq_connection_test`: validates Seq connectivity and API reachability, and reports the resolved root `/health` URL used for the check.
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
- `seq_api_request`: generic verb/path invoker for official cataloged Seq API routes.
- `seq_<verb>_<route>`: auto-generated tool per official route+verb (from docs).

Scope note:

- `seq_starter_*` tools are focused on common read workflows.
- `seq_api_request` and `seq_<verb>_<route>` expose the broader HTTP API surface from the Seq endpoint catalog, including non-`GET` routes.
- Generic requests are constrained to official route templates, with bounded query/path maps and request/response size limits to reduce accidental high-cost calls.

## Agent Usage Process

AI agents should follow this sequence for reliable use:

1. Start with `seq_agent_guide` to get the current workflow guidance and example calls.
2. Use `seq_connection_test` if the target Seq instance, API key, or URL shape may be wrong.
3. Use `seq_starter_overview` to understand the current user, diagnostics status, and visible signals/workspaces.
4. Prefer `seq_starter_events_search`, `seq_starter_data_query`, and other `seq_starter_*` tools for common read workflows.
5. For advanced API access, call `seq_api_catalog` first, then call `seq_api_request` with the exact official route template.

Short examples:

```json
{
    "tool": "seq_starter_events_search",
    "arguments": {
        "filter": "@Level = 'Error'",
        "count": 50,
        "render": true
    }
}
```

```json
{
    "tool": "seq_api_request",
    "arguments": {
        "method": "GET",
        "path": "api/events/{id}",
        "pathParams": {
            "id": "event-123"
        },
        "query": {
            "render": "true"
        }
    }
}
```

Detailed agent workflow guide:

- [`docs/agent-workflows.md`](docs/agent-workflows.md)

## Seq API Key Permissions

Use least privilege based on the exact tools/workflows your MCP client will call.

Authoritative Datalust references:

- API keys and permission model: [Datalust API Keys](https://docs.datalust.co/docs/api-keys)
- HTTP API usage guide: [Using the HTTP API](https://docs.datalust.co/docs/using-the-http-api)
- Server endpoint + permission table: [Server HTTP API](https://docs.datalust.co/docs/server-http-api)

Recommended permission profiles:

- Read-focused starter usage (`seq_starter_*`, `seq_connection_test`, read-only queries): enable `Read`; disable `Ingest`, `Write`, `Project`, `Organization`, `System`.
- Full route-surface usage (`seq_api_request` and `seq_<verb>_<route>`): required permissions depend on the specific route+verb; check `seq_api_catalog` or the official endpoint table before granting.

Permission guidance for this project:

| Permission     | Needed now | Why                                                                                                                    |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Read`         | Yes        | Required by starter query/retrieval workflows.                                                                         |
| `Ingest`       | Usually No | Needed only when calling ingestion routes such as `ingest/*` or `api/events/raw` when API-key-for-writing is required. |
| `Write`        | Maybe      | Needed for write routes (for example signals, dashboards, alerts, permalinks, SQL queries).                            |
| `Project`      | Maybe      | Needed for project-scoped administration and some settings/index routes.                                               |
| `Organization` | Maybe      | Needed for organization/user-management routes.                                                                        |
| `System`       | Maybe      | Needed for system administration routes (for example apps, feeds, backups, updates).                                   |

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
- Oversized requests/responses: returns actionable limit errors instead of exhausting the server process.
- Binary responses: returns structured metadata with base64 payloads for non-text endpoints such as icon routes.

Health check behavior:

- `seq_connection_test` always probes the Seq host root at `/health`.
- If `SEQ_URL` is configured as either `http://host:port` or `http://host:port/api`, the health check resolves to `http://host:port/health`.

## Local Run (Node)

Node.js requirement: v24.15.0 LTS with npm 11.13.0 (see `.nvmrc` and `package.json`).

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

Build image and refresh local MCP catalog artifacts:

```bash
./build-docker-image.sh
```

Run via Docker Compose (recommended for MCP stdio):

PowerShell:

```powershell
./scripts/run-mcp-compose.ps1 -SeqUrl "http://localhost:10150" -SeqApiKey "<YOUR_SEQ_API_KEY>" -Build
```

Bash:

```bash
./scripts/run-mcp-compose.sh --seq-url "http://localhost:10150" --seq-api-key "<YOUR_SEQ_API_KEY>" --build
```

Compose run behavior:

- Value precedence is: explicit script args -> existing environment variables -> `.env`.
- If the target `.env` is missing, scripts create a generic template `.env` automatically.
- When that generated generic template is in use, ensure `SEQ_URL` and `SEQ_API_KEY` are resolved via script args, existing environment variables, or a populated `.env` file.
- `MCP_IMAGE_TAG` is optional; when empty, Compose uses an untagged image reference (`mcp/seq-otlp`).
- Scripts check image availability through compose service metadata and auto-build if the selected tag is not available.
- By default, no container name is specified, so Docker auto-generates a random name.
- You can override container name with `-ContainerName` (PowerShell) or `--container-name` (Bash).
- For security, prefer setting `SEQ_API_KEY` via environment variables or `.env` instead of CLI args.

Or use helper scripts:

PowerShell:

```powershell
./build-docker-image.ps1
```

Bash:

```bash
./build-docker-image.sh
```

Script intent:

- `./build-docker-image.sh`: generates Docker MCP Toolkit manifests, builds and validates the Docker image, and refreshes the local Docker MCP catalog when Docker MCP is available.
- `./build-docker-image.ps1`: generates Docker MCP Toolkit manifests, builds and validates the Docker image, and refreshes the local Docker MCP catalog when Docker MCP is available.
- `./scripts/run-mcp-compose.sh`: runs the MCP server through Docker Compose for stdio use; it can build if needed, but its primary job is to run the container.

Default build behavior:

- When you run the build script without `--tag` or `-Tag`, it builds the named image `mcp/seq-otlp`, which Docker treats as `mcp/seq-otlp:latest`.
- If you want a different reusable image such as `mcp/seq-otlp:v0.3.1`, pass an explicit tag.
- `--latest-tag` or `-LatestTag` remains optional and adds an additional tag alongside the primary image tag.
- To skip local Docker MCP catalog refresh, pass `-SkipDockerMcpCatalogInstall` in PowerShell or `--skip-docker-mcp-catalog-install` in Bash.

Build and push to registry (pullable by other Docker hosts):

PowerShell:

```powershell
./build-docker-image.ps1 -Registry ghcr.io/mclifeleader -Tag v0.3.1 -Push
```

Bash:

```bash
./build-docker-image.sh --registry ghcr.io/mclifeleader --tag v0.3.1 --push
```

By default, the build scripts do not apply an additional tag. If you want one, pass it explicitly with PowerShell `-LatestTag <tag>` or Bash `--latest-tag <tag>`.

Build and export tar (loadable with `docker load`):

PowerShell:

```powershell
./build-docker-image.ps1 -SaveTar ./mcp-seq-otlp.tar
```

Bash:

```bash
./build-docker-image.sh --save-tar ./mcp-seq-otlp.tar
```

Run against local Seq:

```bash
docker run --rm -i \
  -e SEQ_URL=http://host.docker.internal:10150 \
  -e SEQ_API_KEY=your-key \
    mcp/seq-otlp
```

Run against FQDN Seq:

```bash
docker run --rm -i \
  -e SEQ_URL=https://seq.example.com \
  -e SEQ_API_KEY=your-key \
    mcp/seq-otlp
```

Run with Podman:

```bash
podman build -t mcp/seq-otlp .
podman run --rm -i \
  -e SEQ_URL=https://seq.example.com \
  -e SEQ_API_KEY=your-key \
    mcp/seq-otlp
```

The container startup contract requires both variables to be present:

- `SEQ_URL`
- `SEQ_API_KEY`

Optional stability controls:

- `SEQ_TIMEOUT_MS`: request timeout in milliseconds, default `30000`, bounded to `1000-120000`.
- `SEQ_MAX_REQUEST_BYTES`: max outbound request body size, default `262144`.
- `SEQ_MAX_RESPONSE_BYTES`: max inbound response size, default `1048576`.

If either is missing, the container exits immediately with a clear startup error.

Live contract check:

```bash
npm run validate:live-contract
```

This command uses the current `SEQ_URL` and `SEQ_API_KEY` to compare live advertised routes against `src/route-catalog.ts` and to probe safe read-only endpoints for stale `404` entries.

## Copy/Paste MCP Config (Codex and VS Code)

Assumes the image already exists (`mcp/seq-otlp`).

```json
{
    "mcpServers": {
        "seq-otlp": {
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
                "mcp/seq-otlp"
            ]
        }
    }
}
```

## Docker MCP Catalog Compatibility

This repo includes a catalog-ready server definition in:

- `catalog/server.yaml`
- `catalog/tools.json`
- `catalog/docker-mcp-toolkit.yaml`
- `assets/seq-otlp-icon.svg`

`catalog/server.yaml` declares:

- `SEQ_URL` as a required user parameter (mapped via `config.env`)
- `SEQ_API_KEY` as a required secret (mapped via `config.secrets`)

`catalog/server.yaml` and `catalog/tools.json` follow the Docker MCP registry
server format, so they can be used in catalog generation/import workflows (for
example via `docker/mcp-registry` tools).

`catalog/docker-mcp-toolkit.yaml` is a Docker MCP Toolkit local import entry for
`docker mcp catalog server add` / `docker mcp profile server add` workflows.
It is generated by `./build-docker-image.ps1` and `./build-docker-image.sh`
from `catalog/tools.json`, then included in the built image.

Submission checklist for Docker MCP Registry:

- `docs/docker-mcp-registry-submission.md`

## MCP Client Integration Example

Use a command-based MCP client entry that launches the container with stdin/stdout attached.

```json
{
    "mcpServers": {
        "seq-otlp": {
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
                "mcp/seq-otlp"
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
- Project wiki (how-to and operations): [seq-mcp wiki](https://github.com/MCLifeLeader/seq-mcp/wiki)

## Status

Core standalone server scaffold is implemented and buildable.
