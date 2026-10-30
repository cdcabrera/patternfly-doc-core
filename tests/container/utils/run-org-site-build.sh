#!/usr/bin/env bash
# Runs inside the container when AUDIT_RUNTIME_BUILD=1.
set -euo pipefail

ORG_ROOT="/patternfly-org"
META_PATH="${ORG_ROOT}/.org-audit-doc-core-meta.json"
DOC_CORE_SOURCE="${DOC_CORE_SOURCE:-local}"
DOC_CORE_NPM_SPEC="${DOC_CORE_NPM_SPEC:-latest}"
ORG_AUDIT_ORG_SOURCE="${ORG_AUDIT_ORG_SOURCE:-git}"
ORG_REF="${ORG_REF:-main}"

if [[ ! -f "${ORG_ROOT}/packages/site/package.json" ]]; then
  echo "error: ${ORG_ROOT} is not a patternfly-org checkout (missing packages/site)" >&2
  exit 1
fi

cd "${ORG_ROOT}"
corepack enable 2>/dev/null || true

if [[ ! -d node_modules ]] || [[ "${ORG_AUDIT_FORCE_YARN_INSTALL:-}" == 1 ]]; then
  echo "org-audit: yarn install"
  yarn install --immutable
fi

DOC_CORE_SOURCE="${DOC_CORE_SOURCE}" DOC_CORE_NPM_SPEC="${DOC_CORE_NPM_SPEC}" \
  /usr/local/bin/install-doc-core.sh

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
echo "org-audit: yarn ci:build:doc-core"
yarn ci:build:doc-core

node -e "
  const fs = require('fs');
  const { execSync } = require('child_process');
  const metaPath = process.argv[1];
  const orgSource = process.env.ORG_AUDIT_ORG_SOURCE || 'git';
  const hostOrgPath = process.env.ORG_AUDIT_ORG_HOST_PATH || null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  let orgGitSha = null;
  let orgGitRef = process.env.ORG_REF || null;
  try {
    orgGitSha = execSync('git rev-parse HEAD', { cwd: '${ORG_ROOT}', encoding: 'utf8' }).trim();
    if (!orgGitRef || orgGitRef === 'HEAD') {
      orgGitRef = execSync('git rev-parse HEAD', { cwd: '${ORG_ROOT}', encoding: 'utf8' }).trim();
    }
  } catch {
    // not a git checkout
  }
  Object.assign(meta, {
    orgSource,
    orgHostPath: hostOrgPath,
    orgGitSha,
    orgGitRef,
  });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
" "${META_PATH}"
