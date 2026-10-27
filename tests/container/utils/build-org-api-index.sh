#!/usr/bin/env bash
# patternfly-org container build → tests/container/output/ (requires podman or docker).
set -euo pipefail

UTILS_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER_DIR="$(cd "${UTILS_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CONTAINER_DIR}/../.." && pwd)"
OUTPUT_DIR="${CONTAINER_DIR}/output"
BUILD_LOG="${OUTPUT_DIR}/build.log"

ORG_REF="${ORG_REF:-main}"
ORG_REPO="${ORG_REPO:-https://github.com/patternfly/patternfly-org.git}"
ORG_AUDIT_DOC_CORE_SOURCE="${ORG_AUDIT_DOC_CORE_SOURCE:-default}"
ORG_AUDIT_DOC_CORE_NPM_SPEC="${ORG_AUDIT_DOC_CORE_NPM_SPEC:-latest}"
DOC_CORE_GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || true)"
RUN_ID="org-api-audit-$(date -u +%Y%m%d%H%M%S)-$$"
IMAGE_TAG="patternfly-doc-core-org-audit:${RUN_ID}"

IMAGE_ID=""
IID_FILE=""
STAGING_DIR=""

if command -v podman >/dev/null 2>&1; then
  CONTAINER=podman
elif command -v docker >/dev/null 2>&1; then
  CONTAINER=docker
else
  echo "error: install podman or docker to run the org API audit" >&2
  exit 1
fi

if ! "${CONTAINER}" info >/dev/null 2>&1; then
  echo "error: ${CONTAINER} is installed but not running (try: ${CONTAINER} info)" >&2
  exit 1
fi

case "${ORG_AUDIT_DOC_CORE_SOURCE}" in
  default | local | npm) ;;
  *)
    echo "error: ORG_AUDIT_DOC_CORE_SOURCE must be 'default', 'npm', or 'local' (got '${ORG_AUDIT_DOC_CORE_SOURCE}')" >&2
    exit 1
    ;;
esac

cleanup() {
  local status=$?

  if [[ -n "${IMAGE_ID}" ]]; then
    "${CONTAINER}" rmi -f "${IMAGE_ID}" >/dev/null 2>&1 || true
  else
    "${CONTAINER}" rmi -f "${IMAGE_TAG}" >/dev/null 2>&1 || true
  fi
  [[ -z "${IID_FILE}" ]] || rm -f "${IID_FILE}"
  [[ -z "${STAGING_DIR}" ]] || rm -rf "${STAGING_DIR}"
  trap - EXIT INT TERM
  exit "${status}"
}

case "${ORG_AUDIT_DOC_CORE_SOURCE}" in
  default) BUILD_TARGET=org-audit-default ;;
  npm) BUILD_TARGET=org-audit-npm ;;
  local) BUILD_TARGET=org-audit-local ;;
esac

mkdir -p "${OUTPUT_DIR}"
rm -f \
  "${OUTPUT_DIR}/apiIndex.docs.json" \
  "${OUTPUT_DIR}/apiIndex.dist-root.json" \
  "${OUTPUT_DIR}/apiIndex.manifest.json" \
  "${OUTPUT_DIR}/audit-run.json" \
  "${OUTPUT_DIR}/.build-image-id" \
  "${OUTPUT_DIR}/doc-core-meta.json" \
  "${OUTPUT_DIR}/props.json"
: > "${BUILD_LOG}"

STAGING_DIR="$(mktemp -d "${CONTAINER_DIR}/.org-audit-output.XXXXXX")"
IID_FILE="$(mktemp "${CONTAINER_DIR}/.org-audit-image-id.XXXXXX")"
rm -f "${IID_FILE}"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

BUILD_OPTS=(build --target "${BUILD_TARGET}" --no-cache --pull --iidfile "${IID_FILE}" --tag "${IMAGE_TAG}" --label "org.patternfly.doc-core.audit-run=${RUN_ID}" -f "${UTILS_DIR}/Containerfile")
BUILD_OPTS+=(--build-arg "ORG_REF=${ORG_REF}" --build-arg "ORG_REPO=${ORG_REPO}")
BUILD_OPTS+=(--build-arg "DOC_CORE_GIT_SHA=${DOC_CORE_GIT_SHA}")
if [[ "${ORG_AUDIT_DOC_CORE_SOURCE}" == "npm" ]]; then
  BUILD_OPTS+=(--build-arg "DOC_CORE_NPM_SPEC=${ORG_AUDIT_DOC_CORE_NPM_SPEC}")
fi

if [[ "${CONTAINER}" == docker ]]; then
  export DOCKER_BUILDKIT=1
  BUILD_OPTS+=(--progress=plain)
elif "${CONTAINER}" build --help 2>&1 | grep -q -- '--progress'; then
  BUILD_OPTS+=(--progress=plain)
fi

echo "org-api-audit: ${CONTAINER} build ORG_REF=${ORG_REF} DOC_CORE_SOURCE=${ORG_AUDIT_DOC_CORE_SOURCE} TARGET=${BUILD_TARGET} NPM_SPEC=${ORG_AUDIT_DOC_CORE_NPM_SPEC} (context=${REPO_ROOT})" | tee -a "${BUILD_LOG}"
"${CONTAINER}" "${BUILD_OPTS[@]}" "${REPO_ROOT}" 2>&1 | tee -a "${BUILD_LOG}"
IMAGE_ID="$(tr -d '[:space:]' < "${IID_FILE}")"
if [[ -z "${IMAGE_ID}" ]]; then
  echo "error: ${CONTAINER} build did not write an image ID" >&2
  exit 1
fi

echo "org-api-audit: export apiIndex to staging output" | tee -a "${BUILD_LOG}"
"${CONTAINER}" run --rm \
  -e "AUDIT_OUTPUT_DIR=/out" \
  -e "AUDIT_RUN_ID=${RUN_ID}" \
  -v "${STAGING_DIR}:/out" \
  "${IMAGE_ID}" 2>&1 | tee -a "${BUILD_LOG}"

for artifact in apiIndex.docs.json apiIndex.dist-root.json doc-core-meta.json audit-run.json; do
  if [[ ! -s "${STAGING_DIR}/${artifact}" ]]; then
    echo "error: missing audit artifact ${artifact}" >&2
    exit 1
  fi
done

for artifact in apiIndex.docs.json apiIndex.dist-root.json doc-core-meta.json props.json; do
  if [[ -f "${STAGING_DIR}/${artifact}" ]]; then
    mv "${STAGING_DIR}/${artifact}" "${OUTPUT_DIR}/${artifact}"
  fi
done
# Publish the marker last: Jest treats its presence as proof that every required
# artifact above came from this successful run.
mv "${STAGING_DIR}/audit-run.json" "${OUTPUT_DIR}/audit-run.json"
echo "org-api-audit: published fresh artifacts for ${RUN_ID}" | tee -a "${BUILD_LOG}"
