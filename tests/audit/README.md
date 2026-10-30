# Local paired apiIndex audit

Same shape as the org container audit, without patternfly-org or Docker. Future home of `tests/e2e/` when the container gate is renamed.

## Commands

```bash
npm run test:audit                    # Jest globalSetup runs two local builds
AUDIT_SKIP_BUILD=1 npm run test:audit # rerun Jest against a complete prior pair
npm run test:audit:update             # only after a stable, intentional change
```

Jest owns the paired builds through `globalSetup`; the npm scripts invoke Jest
only. Each build starts from clean `dist/` and `.astro/` output, then rebuilds
the CLI before invoking `build --api-only`.

## Artifacts

Written to `tests/audit/output/` by default, or `AUDIT_OUT` when set. Jest
requires both pair artifacts plus the final docs/root artifacts and run marker.

## Integration gate (container, today)

```bash
ORG_AUDIT_DOC_CORE_SOURCE=local npm run test:org
```

See [tests/README.md](../README.md) and [.agent/plans/doc-core-paired-audit-e2e.md](../../.agent/plans/doc-core-paired-audit-e2e.md).
