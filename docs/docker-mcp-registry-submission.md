# Docker MCP Registry Submission Checklist

Use this checklist before opening a PR to `https://github.com/docker/mcp-registry`.

## Upstream References

- Add-server flow: https://github.com/docker/mcp-registry/blob/main/docs/add-server.md
- Server schema: https://github.com/docker/mcp-registry/blob/main/tools/json-schema/catalog.schema.json
- Tools schema: https://github.com/docker/mcp-registry/blob/main/tools/json-schema/tools.schema.json

## Files in This Repo Used for Submission

- `catalog/server.yaml`
- `catalog/tools.json`
- `assets/seq-otel-icon.svg`
- `README.md`
- `.dockerhub-readme.md`

## Preflight (Required)

1. Confirm image is publicly pullable.
   - Example: `mcp/seq-otel:latest` or a versioned tag.

2. Verify `catalog/server.yaml`.
   - `image` is correct and pullable.
   - `source` metadata (URL/ref/path) is correct.
   - `about.icon` points to a public stable URL.
   - `config.env`/`config.secrets` placeholders are accurate.

3. Verify `catalog/tools.json`.
   - Tool list matches actual server behavior.
   - `inputSchema` values are valid JSON schema.
   - Representative public tools are present.

4. Validate this repo build and contract.
   - `npm run check`
   - `npm run build`
   - Build image and run a startup smoke test with required env vars.

5. Re-check upstream docs/schemas on submission day.
   - Registry requirements can change.

## PR Content Checklist

1. Add the server entry using current `docs/add-server.md` guidance.
2. Link to this repository and the public image.
3. Ensure icon and docs links resolve from public internet.
4. Include any required metadata updates requested by maintainers.
