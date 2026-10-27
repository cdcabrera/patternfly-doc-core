# Tests

- **`npm test`** — Jest under `src/` and `cli/`.
- **`npm run test:org-audit`** — builds the selected org audit mode, removes only that temporary image, and fails when its approved snapshots differ.
- **`npm run test:org-audit:update`** — intentionally rebuilds and updates the selected mode's snapshots; use only after reviewing a known-good build.

Snapshots: `tests/container/__snapshots__/orgApiIndex.test.ts.snap`.

Fresh build artifacts: `tests/container/output/apiIndex.docs.json`, `apiIndex.dist-root.json`, `doc-core-meta.json`, `audit-run.json`, and `apiIndex.manifest.json`. The build stages artifacts and publishes the run marker last, so Jest rejects stale or partial output.

Container build context ignores: `.containerignore`.

Env:

| Variable                      | Default                                           | Meaning                                                                                                                        |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ORG_REF`                     | `main`                                            | patternfly-org git ref to clone                                                                                                |
| `ORG_REPO`                    | upstream org URL                                  | Clone source                                                                                                                   |
| `ORG_AUDIT_DOC_CORE_SOURCE`   | **`default`** in npm scripts and the build helper | `default` → org's locked dependency; `npm` → registry package; `local` → this checkout, built and linked through a Yarn portal |
| `ORG_AUDIT_DOC_CORE_NPM_SPEC` | `latest`                                          | npm mode only: a published version or dist-tag passed to Yarn when adding doc-core                                             |

Every mode shallow-clones patternfly-org `main` by default. The modes then diverge:

- `default` runs `yarn install --immutable` and uses the doc-core version already locked by patternfly-org.
- `npm` adds doc-core from the npm registry before building. This tests a newly published package that patternfly-org has not adopted yet.
- `local` copies this checkout into the image, runs its local build, and links it through a Yarn portal.

Run the default, lockfile-based audit:

```bash
npm run test:org-audit
```

Run an npm registry audit (latest by default, or a specific release):

```bash
ORG_AUDIT_DOC_CORE_SOURCE=npm npm run test:org-audit
ORG_AUDIT_DOC_CORE_SOURCE=npm ORG_AUDIT_DOC_CORE_NPM_SPEC=1.24.3 npm run test:org-audit
```

Run the local checkout audit:

```bash
ORG_AUDIT_DOC_CORE_SOURCE=local npm run test:org-audit
```

After a matching build, run Jest directly with the same source mode:

```bash
ORG_AUDIT_DOC_CORE_SOURCE=default npm exec -- jest -c jest.org-audit.config.ts
```
