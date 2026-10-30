#!/usr/bin/env bash
set -euo pipefail

OUT="${AUDIT_OUTPUT_DIR:-/out}"
SITE_DIST="${SITE_DIST:-/patternfly-org/packages/site/dist}"
RUN_ID="${AUDIT_RUN_ID:-}"

if [[ "${AUDIT_RUNTIME_BUILD:-}" == "1" ]]; then
  /usr/local/bin/run-org-site-build.sh
fi

mkdir -p "${OUT}"

for source in \
  "${SITE_DIST}/docs/apiIndex.json" \
  "${SITE_DIST}/apiIndex.json" \
  "/patternfly-org/.org-audit-doc-core-meta.json"; do
  if [[ ! -f "${source}" ]]; then
    echo "error: missing required audit input ${source}" >&2
    exit 1
  fi
done

if [[ -z "${RUN_ID}" ]]; then
  echo "error: AUDIT_RUN_ID is required" >&2
  exit 1
fi

cp -a "${SITE_DIST}/docs/apiIndex.json" "${OUT}/apiIndex.docs.json"
cp -a "${SITE_DIST}/apiIndex.json" "${OUT}/apiIndex.dist-root.json"
if [[ -f "${SITE_DIST}/props.json" ]]; then
  cp -a "${SITE_DIST}/props.json" "${OUT}/props.json"
fi

cp -a /patternfly-org/.org-audit-doc-core-meta.json "${OUT}/doc-core-meta.json"

node -e "
  const fs = require('fs');
  const [out, runId] = process.argv.slice(1);
  const meta = JSON.parse(fs.readFileSync(out + '/doc-core-meta.json', 'utf8'));
  if (!['default', 'local', 'npm'].includes(meta.source)) {
    throw new Error('doc-core metadata is missing a supported source');
  }
  fs.writeFileSync(
    out + '/audit-run.json',
    JSON.stringify({ runId, source: meta.source }, null, 2) + '\n',
  );
" "${OUT}" "${RUN_ID}"

echo "Build artifacts copied to ${OUT}"
