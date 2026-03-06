# Docker MCP Registry Submission Checklist

Use this checklist when preparing a PR to `https://github.com/docker/mcp-registry`.

## Registry References

- Add server flow: https://github.com/docker/mcp-registry/blob/main/docs/add-server.md
- Server metadata schema: https://github.com/docker/mcp-registry/blob/main/tools/json-schema/catalog.schema.json
- Tools metadata schema: https://github.com/docker/mcp-registry/blob/main/tools/json-schema/tools.schema.json

## Files In This Repo Prepared For Submission

- `catalog/server.yaml` (server metadata)
- `catalog/tools.json` (tool metadata)
- `assets/seq-otel-icon.svg` (icon used by `about.icon`)
- `README.md` and `.dockerhub-readme.md` (public documentation)

## Before Submitting PR To docker/mcp-registry

1. Ensure image is publicly pullable:
- `mcp/seq-otel:latest` (or versioned tag)

2. Verify metadata values are accurate:
- `catalog/server.yaml`
- image, source URL/ref/path, icon URL, env/secrets placeholders

3. Verify tools metadata:
- `catalog/tools.json` includes representative public tools and valid `inputSchema`

4. Run local validation in this repo:
- `npm run check`
- `npm run build`
- build image and smoke test startup contract

5. Open PR to docker/mcp-registry:
- Add a server entry according to the current `docs/add-server.md` instructions.
- Include links to this repository and image.

## Notes

- Registry requirements can change. Re-check the upstream docs and schemas before every submission.
- Keep icon and README links public and branch-stable (`main`) for catalog rendering.
