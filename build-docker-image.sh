#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKIP_DOCKER_MCP_CATALOG_INSTALL="${SKIP_DOCKER_MCP_CATALOG_INSTALL:-false}"
BUILD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-docker-mcp-catalog-install)
      SKIP_DOCKER_MCP_CATALOG_INSTALL="true"
      shift
      ;;
    *)
      BUILD_ARGS+=("$1")
      shift
      ;;
  esac
done

"${SCRIPT_DIR}/scripts/build-image.sh" "${BUILD_ARGS[@]}"

if [[ "$SKIP_DOCKER_MCP_CATALOG_INSTALL" == "true" ]]; then
  echo "Skipping local Docker MCP catalog install."
  exit 0
fi

if ! docker mcp --help >/dev/null 2>&1; then
  echo "Docker MCP CLI is not available; skipping local Docker MCP catalog install." >&2
  exit 0
fi

CATALOG_DIR="${HOME}/.docker/mcp/catalogs"
CATALOG_PATH="${CATALOG_DIR}/seq-otlp.yaml"

mkdir -p "${CATALOG_DIR}"
cp "${SCRIPT_DIR}/catalog/docker-mcp-toolkit.yaml" "${CATALOG_PATH}"
docker mcp catalog server add mcp/docker-mcp-catalog:latest --server file://seq-otlp.yaml

echo "Done: build, image validation, and local Docker MCP catalog refresh completed."
