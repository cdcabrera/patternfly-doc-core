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

echo "==> Building container image using ${CONTAINER_ENGINE}..."
cd "${ROOT_DIR}"
${CONTAINER_ENGINE} build \
  -f tests/container/Containerfile \
  -t pf-doc-core-audit:latest .

echo "==> Extracting build artifacts..."
"${CONTAINER_ENGINE}" run --rm \
  -v "${OUTPUT_DIR}:/output${VOL_FLAG}" \
  pf-doc-core-audit:latest

echo "==> Build complete. Artifacts written to ${OUTPUT_DIR}"
