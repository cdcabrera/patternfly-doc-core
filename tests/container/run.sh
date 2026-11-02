#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/tests/container/output"
mkdir -p "${OUTPUT_DIR}"

if command -v podman >/dev/null 2>&1; then
  CONTAINER_ENGINE="podman"
  VOL_FLAG=":Z"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_ENGINE="docker"
  VOL_FLAG=""
else
  echo "Error: Neither podman nor docker found." >&2
  exit 1
fi

echo "==> Building local doc-core CLI & packaging tarball..."
cd "${ROOT_DIR}"
npm run build:cli
TARBALL_NAME="$(npm pack --pack-destination="${ROOT_DIR}/tests/container")"
TARBALL_PATH="tests/container/${TARBALL_NAME}"

echo "==> Building container image..."
DOCKER_BUILDKIT=1 "${CONTAINER_ENGINE}" build \
  -f tests/container/Containerfile \
  --build-arg DOC_CORE_TARBALL="${TARBALL_PATH}" \
  -t pf-doc-core-audit:latest .

rm -f "${TARBALL_PATH}"

echo "==> Extracting build artifacts..."
"${CONTAINER_ENGINE}" run --rm \
  -v "${OUTPUT_DIR}:/output${VOL_FLAG}" \
  pf-doc-core-audit:latest

echo "==> Build complete. Artifacts written to ${OUTPUT_DIR}"
