#!/usr/bin/env bash
set -euo pipefail
UTILS_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=org-audit-env.sh
source "${UTILS_DIR}/org-audit-env.sh"
exec "${UTILS_DIR}/build-org-api-index.sh"
