---
name: build-audit
description: Investigate a potentially nondeterministic build audit through paired unchanged runs before and after one narrowly targeted bug fix.
---

# Two Run Build Audit

Use when a build audit is expensive and its output may vary between runs.

## Required sequence

1. Run the audit.
2. Examine the related test snapshots for a smoke test and record the log results found under `./tests/container/output/` as temporary files, they will be overwritten if not.
3. Immediately run the audit test again with zero code changes.
4. Examine the related test snapshots for a smoke test and record the log results found under `./tests/container/output/` as temporary files, they will be overwritten if not.
5. Compare the two recorded log results, the bug presents as output variance between sequential runs.
6. AFTER inspecting the exact differing behavior between the recorded results make one narrowly targeted change if justified.
7. Run the audit twice and record the outputs again before either starting over at number 1 or drawing a definitive conclusion. 

No recorded `./tests/container/output/` file or audit test snapshot may change between any audit run for this to be a successfully concluded sequence.

## Boundaries

- Do not make multi-file edits or changes beyond the identified potential single bug.
- Do not re-baseline snapshots or replace the audit's alert behavior.
- Do not expand the investigation into a consuming repository unless the paired audit evidence fails to identify a doc-core cause.
- Do not exceed more than 20 loops of the required sequence regardless of conclusion.
- If the two post-change runs match, treat that as an indicator that the suspected issue may have been found; report the paired evidence before concluding.
