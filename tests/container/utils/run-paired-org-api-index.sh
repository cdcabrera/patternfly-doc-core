#!/usr/bin/env bash
# Two back-to-back container builds (remote org + local doc-core) — stability gate.
set -euo pipefail

UTILS_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER_DIR="$(cd "${UTILS_DIR}/.." && pwd)"
RECORD_DIR="${CONTAINER_DIR}/.paired-record"
OUTPUT_DIR="${CONTAINER_DIR}/output"

# shellcheck source=org-audit-env.sh
source "${UTILS_DIR}/org-audit-env.sh"

rm -rf "${RECORD_DIR}"
mkdir -p "${RECORD_DIR}/run1" "${RECORD_DIR}/run2"

echo "paired-org-audit: run 1/2 (ORG_SOURCE=${ORG_AUDIT_ORG_SOURCE} ORG_REF=${ORG_REF} DOC_CORE=${ORG_AUDIT_DOC_CORE_SOURCE})"
"${UTILS_DIR}/run-org-api-index.sh"
cp -R "${OUTPUT_DIR}/." "${RECORD_DIR}/run1/"

echo "paired-org-audit: run 2/2 (no file changes)"
"${UTILS_DIR}/run-org-api-index.sh"
cp -R "${OUTPUT_DIR}/." "${RECORD_DIR}/run2/"

echo "paired-org-audit: recorded ${RECORD_DIR}/run1 and run2"
