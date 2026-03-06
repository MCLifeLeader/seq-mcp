#!/bin/sh
set -eu

if [ -z "${SEQ_URL:-}" ]; then
  echo "seq-mcp startup error: missing required environment variable SEQ_URL" >&2
  exit 64
fi

if [ -z "${SEQ_API_KEY:-}" ]; then
  echo "seq-mcp startup error: missing required environment variable SEQ_API_KEY" >&2
  exit 64
fi

exec "$@"
