#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-mcp/seq-otel}"
TAG="${TAG:-}"
LATEST_TAG="${LATEST_TAG:-}"
REGISTRY="${REGISTRY:-}"
PUSH="${PUSH:-false}"
SAVE_TAR="${SAVE_TAR:-}"

stop_running_containers_for_image() {
  local image_ref="$1"
  local container_ids
  container_ids="$(docker ps -q --filter "ancestor=${image_ref}" || true)"
  if [[ -z "$container_ids" ]]; then
    return
  fi

  echo "Stopping containers using image ${image_ref}: ${container_ids}" >&2
  docker rm -f $container_ids >/dev/null
}

usage() {
  cat <<EOF
Usage: scripts/build-image.sh [options]

Options:
  --image-name <name>   Image name (default: mcp/seq-otel)
  --tag <tag>           Image tag (optional; default Docker behavior is latest)
  --latest-tag <tag>    Additional tag to apply (optional)
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
    --latest-tag)
      LATEST_TAG="$2"
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
  if [[ -n "$TAG" ]]; then
    FULL_IMAGE="${REGISTRY%/}/${IMAGE_NAME}:${TAG}"
  else
    FULL_IMAGE="${REGISTRY%/}/${IMAGE_NAME}"
  fi
else
  if [[ -n "$TAG" ]]; then
    FULL_IMAGE="${IMAGE_NAME}:${TAG}"
  else
    FULL_IMAGE="${IMAGE_NAME}"
  fi
fi

if [[ -n "$LATEST_TAG" && -n "$REGISTRY" ]]; then
  LATEST_IMAGE="${REGISTRY%/}/${IMAGE_NAME}:${LATEST_TAG}"
elif [[ -n "$LATEST_TAG" ]]; then
  LATEST_IMAGE="${IMAGE_NAME}:${LATEST_TAG}"
else
  LATEST_IMAGE=""
fi

if [[ -n "$TAG" ]]; then
  LOCAL_IMAGE="${IMAGE_NAME}:${TAG}"
  IMAGE_VERSION="$TAG"
else
  LOCAL_IMAGE="${IMAGE_NAME}"
  IMAGE_VERSION="none"
fi

if command -v git >/dev/null 2>&1; then
  VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
else
  VCS_REF="unknown"
fi

BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -n "$LOCAL_IMAGE" ]]; then
  stop_running_containers_for_image "$LOCAL_IMAGE"
fi
if [[ -n "$FULL_IMAGE" && "$FULL_IMAGE" != "$LOCAL_IMAGE" ]]; then
  stop_running_containers_for_image "$FULL_IMAGE"
fi
if [[ -n "$LATEST_IMAGE" && "$LATEST_IMAGE" != "$LOCAL_IMAGE" && "$LATEST_IMAGE" != "$FULL_IMAGE" ]]; then
  stop_running_containers_for_image "$LATEST_IMAGE"
fi

echo "Building image: ${FULL_IMAGE}"
BUILD_ARGS=(
  build
  --build-arg IMAGE_VERSION="${IMAGE_VERSION}" \
  --build-arg VCS_REF="${VCS_REF}" \
  --build-arg BUILD_DATE="${BUILD_DATE}"
)

BUILD_ARGS+=(-t "${FULL_IMAGE}")

if [[ -n "$LATEST_IMAGE" && "$LATEST_IMAGE" != "$FULL_IMAGE" ]]; then
  BUILD_ARGS+=(-t "${LATEST_IMAGE}")
fi

BUILD_ARGS+=(.)

docker "${BUILD_ARGS[@]}"

if [[ "$PUSH" == "true" ]]; then
  echo "Pushing image: ${FULL_IMAGE}"
  docker push "${FULL_IMAGE}"

  if [[ -n "$LATEST_IMAGE" && "$LATEST_IMAGE" != "$FULL_IMAGE" ]]; then
    echo "Pushing image: ${LATEST_IMAGE}"
    docker push "${LATEST_IMAGE}"
  fi
fi

if [[ -n "$SAVE_TAR" ]]; then
  echo "Saving image archive: ${SAVE_TAR}"
  if [[ -n "$LATEST_IMAGE" && "$LATEST_IMAGE" != "$FULL_IMAGE" ]]; then
    docker save -o "${SAVE_TAR}" "${FULL_IMAGE}" "${LATEST_IMAGE}"
  else
    docker save -o "${SAVE_TAR}" "${FULL_IMAGE}"
  fi
fi

if [[ -n "$LATEST_IMAGE" && "$LATEST_IMAGE" != "$FULL_IMAGE" ]]; then
  echo "Done: ${FULL_IMAGE} and ${LATEST_IMAGE}"
else
  echo "Done: ${FULL_IMAGE}"
fi
