# Tests

- **`npm test`** — Jest under `src/` and `cli/`.
- **`npm run test:audit`** — paired local `build --api-only` (no container).
- **`npm run test:audit:update`** — update audit snapshots after a stable pair.

### Org container audit (default)

**Remote patternfly-org** (shallow git clone at `ORG_REF`) + **this doc-core repo** (Yarn portal). Requires Podman or Docker.

| Script | What it does |
| ------ | ------------- |
| **`npm run test:org`** | One container build → Jest on `tests/container/output/` |
| **`npm run test:org:stability`** | **Two** back-to-back builds, no edits → Jest proves identical `apiIndex.docs.json` |
| **`npm run test:org:update`** | Rebuild once, refresh Jest snapshots |

Pin upstream org to a commit:

```bash
ORG_REF=8e08661e4e3f58644570bc9a4db75eb7884f3947 npm run test:org:stability
```

After publishing doc-core, prove the npm package the same way:

```bash
ORG_REF=main ORG_AUDIT_DOC_CORE_SOURCE=npm ORG_AUDIT_DOC_CORE_NPM_SPEC=1.24.3 npm run test:org:stability
```

Optional: mount a host org checkout instead of git (`ORG_AUDIT_ORG_SOURCE=local`, `ORG_AUDIT_ORG_PATH=…`) for org-side edits only.

### Env (defaults in `tests/container/utils/org-audit-env.sh`)

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `ORG_REF` | `main` | Shallow-clone this ref from `ORG_REPO` |
| `ORG_REPO` | patternfly-org on GitHub | Clone URL |
| `ORG_AUDIT_ORG_SOURCE` | `git` | `git` = clone in image; `local` = bind-mount host org |
| `ORG_AUDIT_DOC_CORE_SOURCE` | **`local`** | This repo mounted at `/patternfly-doc-core` |
| `ORG_AUDIT_DOC_CORE_NPM_SPEC` | `latest` | When `ORG_AUDIT_DOC_CORE_SOURCE=npm` |
| `ORG_AUDIT_FORCE_IMAGE_REBUILD` | unset | Rebuild cached git-org image |

Artifacts: `tests/container/output/`. Paired runs: `tests/container/.paired-record/`.
