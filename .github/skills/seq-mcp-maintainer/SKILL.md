# seq-mcp-maintainer

Use this skill to maintain and evolve the `seq-mcp` server as Seq API functionality changes.

## Use When

- User asks to "update Seq API coverage"
- User asks to "re-scan routes" or "sync to latest Seq endpoints"
- User asks to regenerate API maps/catalogs
- User asks to reconcile permissions/verbs/routes after Seq upgrades

## Inputs Required

- `.env` with:
  - `SEQ_URL`
  - `SEQ_API_KEY`

## Required Sources

- https://datalust.co/
- https://docs.datalust.co/docs/server-http-api
- https://docs.datalust.co/docs/using-the-http-api
- https://docs.datalust.co/docs/api-keys

## Workflow

1. Discover live API links from local Seq instance:
- `GET /api`
- Follow each `*/resources` endpoint
- Collect `name -> route`

2. Parse official endpoint table:
- Extract `Path`, `HTTP method`, `Permission demand`, notes

3. Regenerate and reconcile:
- Update `src/route-catalog.ts`
- Update `docs/api-map.md`
- Update starter aliases in `src/index.ts` if needed
- Update `README.md` if permissions/behavior changed

4. Validate:
- `npm run check`
- `npm run build`

5. Report:
- Added endpoints
- Removed endpoints
- Changed permissions/methods/notes
- Any breaking behavior changes in aliases

## Definition of Done

- API map reflects live + official state
- Route catalog matches official docs
- MCP server compiles
- Documentation and aliases reflect current capabilities
