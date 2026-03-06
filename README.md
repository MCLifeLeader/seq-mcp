# seq-mcp

Unofficial MCP server for integrating AI agents with [Datalust Seq](https://datalust.co/) and OpenTelemetry data.

## Purpose

This repository is being shaped into a Dockerized MCP server that enables tools like Codex and Copilot to query and analyze telemetry/log data stored in Seq.

## Target Outcome

- Provide MCP tools for safe, direct access to Seq data.
- Support common telemetry workflows: search, traces, events, and diagnostics context.
- Run as a container-first service suitable for local development and hosted deployment.

## Scope

- MCP server implementation (transport, tool surface, validation).
- Seq connectivity and query abstraction.
- Security controls for credentials, query boundaries, and output sanitization.
- Docker image and runtime configuration.

## Planned High-Level Architecture

- `src/`: MCP server source code.
- `Dockerfile` and/or compose manifests: container build and runtime.
- Environment-driven configuration for Seq endpoint and API credentials.
- Tool contracts designed for agent-safe, observable interactions.

## Status

Initial repository cleanup and instruction refocus completed. Core server implementation is the next phase.

## Notes

- This project is unofficial and not affiliated with Datalust.
- Seq is a product of Datalust.
