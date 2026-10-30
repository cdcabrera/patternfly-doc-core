#!/usr/bin/env bash
# Remote patternfly-org (shallow git) + doc-core → tests/container/output/
set -euo pipefail

UTILS_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=org-audit-env.sh
source "${UTILS_DIR}/org-audit-env.sh"

CONTAINER_DIR="$(cd "${UTILS_DIR}/.." && pwd)"
OUTPUT_DIR="${CONTAINER_DIR}/output"
BUILD_LOG="${OUTPUT_DIR}/build.log"

ORG_AUDIT_ORG_IMAGE="${ORG_AUDIT_ORG_IMAGE:-patternfly-doc-core-org-audit:git-yarn}"
DOC_CORE_GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || true)"
RUN_ID="org-api-audit-$(date -u +%Y%m%d%H%M%S)-$$"
IMAGE_TAG="patternfly-doc-core-org-audit:${RUN_ID}"

IMAGE_ID=""
IID_FILE=""
STAGING_DIR=""
SKIP_IMAGE_CLEANUP=0

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

case "${ORG_AUDIT_ORG_SOURCE}" in
  git | local) ;;
  *)
    echo "error: ORG_AUDIT_ORG_SOURCE must be 'git' or 'local' (got '${ORG_AUDIT_ORG_SOURCE}')" >&2
    exit 1
    ;;
esac

case "${ORG_AUDIT_DOC_CORE_SOURCE}" in
  default | local | npm) ;;
  *)
    echo "error: ORG_AUDIT_DOC_CORE_SOURCE must be 'default', 'npm', or 'local' (got '${ORG_AUDIT_DOC_CORE_SOURCE}')" >&2
    exit 1
    ;;
esac

if [[ "${ORG_AUDIT_ORG_SOURCE}" == local ]]; then
  if [[ "${ORG_AUDIT_ORG_PATH}" != /* ]]; then
    ORG_AUDIT_ORG_PATH="${REPO_ROOT}/${ORG_AUDIT_ORG_PATH}"
  fi
  ORG_AUDIT_ORG_PATH="$(cd "${ORG_AUDIT_ORG_PATH}" && pwd)"
  if [[ ! -f "${ORG_AUDIT_ORG_PATH}/packages/site/package.json" ]]; then
    echo "error: ORG_AUDIT_ORG_PATH must be a patternfly-org root (missing packages/site): ${ORG_AUDIT_ORG_PATH}" >&2
    exit 1
  fi
fi

cleanup() {
  local status=$?

  if [[ "${SKIP_IMAGE_CLEANUP}" == 1 ]]; then
    :
  elif [[ -n "${IMAGE_ID}" ]]; then
    "${CONTAINER}" rmi -f "${IMAGE_ID}" >/dev/null 2>&1 || true
  else
    "${CONTAINER}" rmi -f "${IMAGE_TAG}" >/dev/null 2>&1 || true
  fi
  [[ -z "${IID_FILE}" ]] || rm -f "${IID_FILE}"
  [[ -z "${STAGING_DIR}" ]] || rm -rf "${STAGING_DIR}"
  trap - EXIT INT TERM
  exit "${status}"
}

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

volume_mount_suffix() {
  if [[ "${CONTAINER}" == podman ]]; then
    printf '%s' ':Z'
  else
    printf '%s' ''
  fi
}

org_image_tag() {
  local ref_safe
  ref_safe="$(printf '%s' "${ORG_REF}" | tr '/:' '__' | tr -cd '[:alnum:]._-' | head -c 48)"
  printf '%s' "${ORG_AUDIT_ORG_IMAGE}-${ref_safe}"
}

build_image() {
  local target=$1
  shift
  local opts=(build --target "${target}" --iidfile "${IID_FILE}" --tag "${IMAGE_TAG}")
  opts+=(--build-arg "ORG_REF=${ORG_REF}" --build-arg "ORG_REPO=${ORG_REPO}")
  opts+=(--build-arg "DOC_CORE_GIT_SHA=${DOC_CORE_GIT_SHA}")
  opts+=("$@")
  opts+=(-f "${UTILS_DIR}/Containerfile")

  if [[ "${CONTAINER}" == docker ]]; then
    export DOCKER_BUILDKIT=1
    opts+=(--progress=plain)
  elif "${CONTAINER}" build --help 2>&1 | grep -q -- '--progress'; then
    opts+=(--progress=plain)
  fi

  echo "org-api-audit: ${CONTAINER} build target=${target} ORG_REF=${ORG_REF} DOC_CORE=${ORG_AUDIT_DOC_CORE_SOURCE}" | tee -a "${BUILD_LOG}"
  "${CONTAINER}" "${opts[@]}" "${REPO_ROOT}" 2>&1 | tee -a "${BUILD_LOG}"
  IMAGE_ID="$(tr -d '[:space:]' < "${IID_FILE}")"
}

ensure_git_org_yarn_image() {
  local tag
  tag="$(org_image_tag)"
  local suffix
  suffix="$(volume_mount_suffix)"

  if [[ -z "${ORG_AUDIT_FORCE_IMAGE_REBUILD:-}" ]]; then
    if "${CONTAINER}" image exists "${tag}" >/dev/null 2>&1; then
      IMAGE_ID="$("${CONTAINER}" image inspect "${tag}" --format '{{.Id}}' 2>/dev/null || true)"
      if [[ -n "${IMAGE_ID}" ]]; then
        echo "org-api-audit: reusing git org image ${tag} (ORG_REF=${ORG_REF})" | tee -a "${BUILD_LOG}"
        SKIP_IMAGE_CLEANUP=1
        return 0
      fi
    fi
  fi

  build_image org-audit-git-yarn --tag "${tag}" --label "org.patternfly.org.ref=${ORG_REF}"
  SKIP_IMAGE_CLEANUP=1
}

ensure_local_org_runtime_image() {
  local suffix
  suffix="$(volume_mount_suffix)"
  local runtime_tag="${ORG_AUDIT_RUNTIME_IMAGE:-patternfly-doc-core-org-audit:runtime}"

  if [[ -z "${ORG_AUDIT_FORCE_IMAGE_REBUILD:-}" ]]; then
    if "${CONTAINER}" image exists "${runtime_tag}" >/dev/null 2>&1; then
      IMAGE_ID="$("${CONTAINER}" image inspect "${runtime_tag}" --format '{{.Id}}' 2>/dev/null || true)"
      if [[ -n "${IMAGE_ID}" ]]; then
        echo "org-api-audit: reusing runtime image ${runtime_tag}" | tee -a "${BUILD_LOG}"
        SKIP_IMAGE_CLEANUP=1
        return 0
      fi
    fi
  fi

  build_image org-audit-runtime --tag "${runtime_tag}" --label "org.patternfly.doc-core.audit-runtime=1"
  SKIP_IMAGE_CLEANUP=1
}

if [[ "${ORG_AUDIT_ORG_SOURCE}" == local ]]; then
  ensure_local_org_runtime_image
elif [[ "${ORG_AUDIT_DOC_CORE_SOURCE}" == local ]]; then
  ensure_git_org_yarn_image
else
  case "${ORG_AUDIT_DOC_CORE_SOURCE}" in
    default) build_image org-audit-default --no-cache --pull ;;
    npm)
      build_image org-audit-npm --no-cache --pull \
        --build-arg "DOC_CORE_NPM_SPEC=${ORG_AUDIT_DOC_CORE_NPM_SPEC}"
      ;;
  esac
fi

if [[ -z "${IMAGE_ID}" ]]; then
  echo "error: ${CONTAINER} build did not resolve an image ID" >&2
  exit 1
fi

MOUNT_SUFFIX="$(volume_mount_suffix)"
RUN_OPTS=(
  run
  --rm
  -e "AUDIT_OUTPUT_DIR=/out"
  -e "AUDIT_RUN_ID=${RUN_ID}"
  -e "DOC_CORE_SOURCE=${ORG_AUDIT_DOC_CORE_SOURCE}"
  -e "DOC_CORE_NPM_SPEC=${ORG_AUDIT_DOC_CORE_NPM_SPEC}"
  -e "ORG_REF=${ORG_REF}"
  -e "ORG_AUDIT_ORG_SOURCE=${ORG_AUDIT_ORG_SOURCE}"
)

if [[ "${ORG_AUDIT_ORG_SOURCE}" == local ]]; then
  RUN_OPTS+=(-e "AUDIT_RUNTIME_BUILD=1")
  RUN_OPTS+=(-e "ORG_AUDIT_ORG_HOST_PATH=${ORG_AUDIT_ORG_PATH}")
  RUN_OPTS+=(-v "${ORG_AUDIT_ORG_PATH}:/patternfly-org${MOUNT_SUFFIX}")
  if [[ "${ORG_AUDIT_DOC_CORE_SOURCE}" == local ]]; then
    RUN_OPTS+=(-e "DOC_CORE_GIT_SHA=${DOC_CORE_GIT_SHA}")
    RUN_OPTS+=(-v "${REPO_ROOT}:/patternfly-doc-core${MOUNT_SUFFIX}")
  fi
elif [[ "${ORG_AUDIT_DOC_CORE_SOURCE}" == local ]]; then
  RUN_OPTS+=(-e "AUDIT_RUNTIME_BUILD=1")
  RUN_OPTS+=(-e "DOC_CORE_GIT_SHA=${DOC_CORE_GIT_SHA}")
  RUN_OPTS+=(-v "${REPO_ROOT}:/patternfly-doc-core${MOUNT_SUFFIX}")
fi

RUN_OPTS+=(-v "${STAGING_DIR}:/out${MOUNT_SUFFIX}")
RUN_OPTS+=("${IMAGE_ID}")

echo "org-api-audit: run (ORG_SOURCE=${ORG_AUDIT_ORG_SOURCE} ORG_REF=${ORG_REF} DOC_CORE_SOURCE=${ORG_AUDIT_DOC_CORE_SOURCE})" | tee -a "${BUILD_LOG}"
"${CONTAINER}" "${RUN_OPTS[@]}" 2>&1 | tee -a "${BUILD_LOG}"

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
mv "${STAGING_DIR}/audit-run.json" "${OUTPUT_DIR}/audit-run.json"
echo "org-api-audit: published fresh artifacts for ${RUN_ID}" | tee -a "${BUILD_LOG}"
