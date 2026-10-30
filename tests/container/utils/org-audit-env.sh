#!/usr/bin/env bash
# Shared defaults: remote patternfly-org (shallow git) + this doc-core checkout.
UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_DIR="$(cd "${UTILS_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CONTAINER_DIR}/../.." && pwd)"

export ORG_AUDIT_ORG_SOURCE="${ORG_AUDIT_ORG_SOURCE:-git}"
export ORG_AUDIT_DOC_CORE_SOURCE="${ORG_AUDIT_DOC_CORE_SOURCE:-local}"
export ORG_REF="${ORG_REF:-main}"
export ORG_REPO="${ORG_REPO:-https://github.com/patternfly/patternfly-org.git}"
export ORG_AUDIT_ORG_PATH="${ORG_AUDIT_ORG_PATH:-${REPO_ROOT}/.agent/patternfly-org}"
export ORG_AUDIT_DOC_CORE_NPM_SPEC="${ORG_AUDIT_DOC_CORE_NPM_SPEC:-latest}"
