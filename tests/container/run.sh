#!/usr/bin/env bash
# Same org audit for snapshot and paired stability: build one reusable image,
# then run a fresh org build in each ephemeral container.
# ORG_AUDIT_RUNS=1 → output/run1 only (npm run test:org)
# ORG_AUDIT_RUNS=2 → run1 then run2, with no source changes between builds.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/tests/container/output"
RUNS="${ORG_AUDIT_RUNS:-1}"
DOC_CORE_REV="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
ORG_REF="${ORG_REF:-main}"
ORG_REPO="${ORG_REPO:-https://github.com/patternfly/patternfly-org.git}"

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

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/run1" "${OUTPUT_DIR}/run2"

cd "${ROOT_DIR}"

build_audit_image() {
  echo "==> preparing org apiIndex audit image (${CONTAINER_ENGINE}, ORG_REF=${ORG_REF})"
  ${CONTAINER_ENGINE} build \
    --build-arg DOC_CORE_REV="${DOC_CORE_REV}" \
    --build-arg ORG_REF="${ORG_REF}" \
    --build-arg ORG_REPO="${ORG_REPO}" \
    -f tests/container/Containerfile \
    -t pf-doc-core-audit:latest \
    .
}

run_org_audit() {
  local dest="$1"
  local run_id="$2"
  echo "==> org apiIndex build ${run_id} (${CONTAINER_ENGINE}) → ${dest}"
  ${CONTAINER_ENGINE} run --rm \
    -e "AUDIT_RUN_ID=${run_id}" \
    -v "${dest}:/output${VOL_FLAG}" \
    pf-doc-core-audit:latest
}

build_audit_image
run_org_audit "${OUTPUT_DIR}/run1" run1

if [[ "${RUNS}" == "2" ]]; then
  run_org_audit "${OUTPUT_DIR}/run2" run2
fi

echo "==> Artifacts under ${OUTPUT_DIR}"
