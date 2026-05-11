# Agent Workflows

This MCP server is designed for AI agents that need safe, bounded access to a
user-owned Datalust Seq instance.

## Start Here

Agents should use this order unless the user asks for a specific route:

1. Call `seq_agent_guide` to learn the tool selection rules, examples, and limits.
2. Call `seq_connection_test` when connection or authentication status is unknown.
3. Call `seq_starter_overview` to understand the current user, diagnostics status, signals, and workspaces.
4. Use a `seq_starter_*` tool for common read workflows.
5. Use `seq_api_catalog` before `seq_api_request` for advanced routes.

## Common Tasks

| Task                          | Preferred tool                                           | Notes                                                                  |
| ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Verify configuration          | `seq_connection_test`                                    | Reports resolved API and health URLs.                                  |
| Get a quick Seq summary       | `seq_starter_overview`                                   | Uses safe read-only endpoints and scoped list requests.                |
| Search logs/events            | `seq_starter_events_search`                              | Supports filter, signal, UTC time range, count, and rendered messages. |
| Fetch one event               | `seq_starter_event_by_id`                                | Use after an event id is known.                                        |
| Run an aggregate query        | `seq_starter_data_query`                                 | Use `q`, `count`, and UTC time bounds when possible.                   |
| Discover signals              | `seq_starter_signals_list`                               | Returns shared and personal signals visible to the API key.            |
| Discover dashboards or alerts | `seq_starter_dashboards_list`, `seq_starter_alerts_list` | Returns shared and personal resources visible to the API key.          |
| Discover API routes           | `seq_api_catalog`                                        | Search by method, permission, route family, or notes.                  |
| Call an advanced route        | `seq_api_request`                                        | Only accepts official cataloged route templates.                       |

## Query Patterns

Recent errors:

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

Bounded aggregate query:

```json
{
    "tool": "seq_starter_data_query",
    "arguments": {
        "q": "select count(*) as Count by ServiceName from stream group by ServiceName order by Count desc",
        "fromDateUtc": "2026-05-11T00:00:00Z",
        "toDateUtc": "2026-05-11T01:00:00Z",
        "count": 100
    }
}
```

Advanced route call:

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

## Guardrails

- Prefer starter tools for read workflows.
- Keep event and query counts at or below `500`.
- Provide UTC time windows for broad searches.
- Use least-privilege Seq API keys.
- Do not guess advanced paths; call `seq_api_catalog` first.
- Treat `Project`, `Organization`, and `System` routes as elevated operations.
