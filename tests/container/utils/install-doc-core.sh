#!/usr/bin/env bash
# default = org lockfile; npm = registry package; local = build + portal checkout
set -euo pipefail

DOC_CORE_DIR="/patternfly-doc-core"
META_PATH="/patternfly-org/.org-audit-doc-core-meta.json"
DOC_CORE_SOURCE="${DOC_CORE_SOURCE:-}"
DOC_CORE_NPM_SPEC="${DOC_CORE_NPM_SPEC:-latest}"

write_meta() {
  node -e "
    const fs = require('fs');
    fs.writeFileSync(process.argv[2], JSON.stringify(JSON.parse(process.argv[1]), null, 2) + '\n');
  " "$1" "${META_PATH}"
}

case "${DOC_CORE_SOURCE}" in
  default)
    echo "org-audit: @patternfly/patternfly-doc-core from the org yarn.lock"
    RANGE="$(node -p "require('/patternfly-org/packages/site/package.json').dependencies['@patternfly/patternfly-doc-core']")"
    write_meta "$(node -e "console.log(JSON.stringify({ source: 'default', requestedRange: process.argv[1] }))" "${RANGE}")"
    exit 0
    ;;
  npm)
    echo "org-audit: install @patternfly/patternfly-doc-core@${DOC_CORE_NPM_SPEC} from npm"
    cd /patternfly-org
    yarn workspace site add "@patternfly/patternfly-doc-core@${DOC_CORE_NPM_SPEC}"
    yarn install
    RANGE="$(node -p "require('/patternfly-org/packages/site/package.json').dependencies['@patternfly/patternfly-doc-core']")"
    write_meta "$(node -e "console.log(JSON.stringify({ source: 'npm', requestedSpec: process.argv[1], installedRange: process.argv[2] }))" "${DOC_CORE_NPM_SPEC}" "${RANGE}")"
    exit 0
    ;;
  local) ;;
  *)
    echo "error: DOC_CORE_SOURCE must be 'default', 'npm', or 'local' (got '${DOC_CORE_SOURCE}')" >&2
    exit 1
    ;;
esac

echo "org-audit: build doc-core in ${DOC_CORE_DIR} and link into site workspace"
cd "${DOC_CORE_DIR}"
npm ci
npm run build:cli

cd /patternfly-org
yarn workspace site add "@patternfly/patternfly-doc-core@portal:${DOC_CORE_DIR}"
yarn install

node -e "
  const fs = require('fs');
  const p = require('${DOC_CORE_DIR}/package.json');
  const meta = {
    source: 'local',
    copyStrategy: 'copy',
    path: '${DOC_CORE_DIR}',
    name: p.name,
    version: p.version,
    gitSha: process.env.DOC_CORE_GIT_SHA || null,
  };
  fs.writeFileSync('${META_PATH}', JSON.stringify(meta, null, 2) + '\n');
"
