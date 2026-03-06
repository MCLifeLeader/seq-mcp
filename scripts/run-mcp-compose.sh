#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-compose.mcp.yaml}"
SEQ_URL_ARG=""
SEQ_API_KEY_ARG=""
BUILD="false"
CONTAINER_NAME=""

usage() {
  cat <<EOF
Usage: scripts/run-mcp-compose.sh [options]

Options:
  --seq-url <url>           Seq URL (optional if SEQ_URL already set)
  --seq-api-key <key>       Seq API key (optional if SEQ_API_KEY already set)
  --compose-file <path>     Compose file (default: compose.mcp.yaml)
  --container-name <name>   Container name override (default: Docker-generated random name)
  --build                   Build image before run
  -h, --help                Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seq-url)
      SEQ_URL_ARG="$2"
      shift 2
      ;;
    --seq-api-key)
      SEQ_API_KEY_ARG="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --container-name)
      CONTAINER_NAME="$2"
      shift 2
      ;;
    --build)
      BUILD="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -n "$SEQ_URL_ARG" ]]; then
  export SEQ_URL="$SEQ_URL_ARG"
fi

if [[ -n "$SEQ_API_KEY_ARG" ]]; then
  export SEQ_API_KEY="$SEQ_API_KEY_ARG"
fi

# Fallback to .env only for missing values.
if [[ -f ".env" ]]; then
  while IFS= read -r line; do
    [[ -z "${line// }" ]] && continue
    [[ "$line" == \#* ]] && continue
    if [[ "$line" == *=* ]]; then
      key="${line%%=*}"
      value="${line#*=}"
      key="${key//[[:space:]]/}"
      if [[ -n "$key" && -z "${!key:-}" ]]; then
        export "$key=$value"
      fi
    fi
  done < .env
fi

if [[ -z "${SEQ_URL:-}" ]]; then
  echo "SEQ_URL is required. Use --seq-url, set SEQ_URL, or add SEQ_URL to .env." >&2
  exit 1
fi

if [[ -z "${SEQ_API_KEY:-}" ]]; then
  echo "SEQ_API_KEY is required. Use --seq-api-key, set SEQ_API_KEY, or add SEQ_API_KEY to .env." >&2
  exit 1
fi

if ! docker image inspect mcp/seq-otel:latest >/dev/null 2>&1; then
  BUILD="true"
fi

if [[ "$BUILD" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" build seq-otel-mcp
fi

echo "Starting MCP server over stdio using docker compose..."
if [[ -n "$CONTAINER_NAME" ]]; then
  exec docker compose -f "$COMPOSE_FILE" run --rm -i --name "$CONTAINER_NAME" seq-otel-mcp
else
  exec docker compose -f "$COMPOSE_FILE" run --rm -i seq-otel-mcp
fi
