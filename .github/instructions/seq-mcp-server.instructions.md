---
applyTo: '**/*'
description: 'Project-specific instructions for building the Seq MCP server and its agent-facing contracts.'
---

# Seq MCP Server Instructions

## Goal

Build and maintain an MCP server that enables AI agents to safely query and inspect data from Datalust Seq and its OpenTelemetry-backed events.

## Design Requirements

- Define MCP tools with strict schemas and clear intent boundaries.
- Keep tool responses concise, structured, and deterministic when possible.
- Prevent unbounded or unsafe queries through input validation, limits, and defaults.
- Implement robust error mapping so agent clients receive actionable failures.

## Seq Integration Requirements

- Keep Seq endpoint and API credentials externalized in configuration.
- Use least-privilege access patterns for Seq API keys.
- Sanitize and validate all user/agent-provided filters or query fragments.
- Apply paging/time-window constraints by default to avoid excessive data pulls.

## Container Requirements

- Ensure the service runs cleanly as a containerized workload.
- Expose configuration through environment variables.
- Keep image/runtime surface minimal and secure.

## Quality Bar

- Prioritize correctness, security, and contract clarity.
- Keep naming and module boundaries straightforward.
- Add/update tests for parsing, validation, and Seq client behavior when code exists.
