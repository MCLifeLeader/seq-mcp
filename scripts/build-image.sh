#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-mcp/seq-otel}"
TAG="${TAG:-latest}"
REGISTRY="${REGISTRY:-}"
PUSH="${PUSH:-false}"
SAVE_TAR="${SAVE_TAR:-}"

usage() {
  cat <<EOF
Usage: scripts/build-image.sh [options]

Options:
  --image-name <name>   Image name (default: mcp/seq-otel)
  --tag <tag>           Image tag (default: latest)
  --registry <registry> Optional registry prefix (example: ghcr.io/my-org)
  --push                Push after build
  --save-tar <path>     Save image archive to tar file
  -h, --help            Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image-name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --push)
      PUSH="true"
      shift
      ;;
    --save-tar)
      SAVE_TAR="$2"
      shift 2
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

if [[ -n "$REGISTRY" ]]; then
  FULL_IMAGE="${REGISTRY%/}/${IMAGE_NAME}:${TAG}"
else
  FULL_IMAGE="${IMAGE_NAME}:${TAG}"
fi

if command -v git >/dev/null 2>&1; then
  VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
else
  VCS_REF="unknown"
fi

BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Building image: ${FULL_IMAGE}"
docker build \
  --build-arg IMAGE_VERSION="${TAG}" \
  --build-arg VCS_REF="${VCS_REF}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  -t "${FULL_IMAGE}" .

if [[ "$PUSH" == "true" ]]; then
  echo "Pushing image: ${FULL_IMAGE}"
  docker push "${FULL_IMAGE}"
fi

if [[ -n "$SAVE_TAR" ]]; then
  echo "Saving image archive: ${SAVE_TAR}"
  docker save -o "${SAVE_TAR}" "${FULL_IMAGE}"
fi

echo "Done: ${FULL_IMAGE}"
