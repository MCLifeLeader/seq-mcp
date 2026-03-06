# Codex Agents Instructions

This repository is focused on one goal: a Dockerized MCP server for Datalust Seq OpenTelemetry data access.

## Primary Sources Of Truth

1. `.github/copilot-instructions.md`
2. `.github/instructions/seq-mcp-server.instructions.md`
3. `.github/instructions/security-and-owasp.instructions.md`
4. `.github/instructions/containerization-docker-best-practices.instructions.md`

If guidance conflicts, use the most specific file.

## Required Behavior

- Keep implementations aligned with MCP server responsibilities and Seq data access workflows.
- Prefer clean contracts and explicit breaking changes over preserving unclear legacy patterns.
- Keep all credentials/config externalized via environment variables or secret stores.
- Keep container runtime and networking secure by default.

## Scope

This file intentionally stays minimal and points to the active instruction set for this repo.
