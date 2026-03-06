# Copilot Instructions for seq-mcp

This repository is dedicated to building a Dockerized MCP server that provides AI agents (for example Codex and Copilot) with controlled access to Datalust Seq OpenTelemetry data.

## Priority Rules

1. Follow `.github/instructions/seq-mcp-server.instructions.md` first.
2. Apply security guidance from `.github/instructions/security-and-owasp.instructions.md`.
3. Apply container guidance from `.github/instructions/containerization-docker-best-practices.instructions.md`.

If rules conflict, the more specific Seq MCP rule wins.

## Engineering Expectations

- Model all external interactions as explicit MCP tools with clear input/output contracts.
- Validate and constrain query inputs before issuing any Seq request.
- Never hardcode secrets; use environment variables.
- Design for container-first execution and reproducible local runs.
- Favor small, testable components with observable behavior.

## Out of Scope

- Generic scaffolding unrelated to Seq MCP integration.
- Legacy compatibility work that weakens clarity or security.
