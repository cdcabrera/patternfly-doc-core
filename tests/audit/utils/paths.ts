import { existsSync } from 'fs'
import { join } from 'path'

const auditDir = join(__dirname, '..')
const outputDir = process.env.AUDIT_OUT ?? join(auditDir, 'output')

/** Mirrors `tests/container/utils/apiIndex.ts` layout for Jest parity. */
export const auditPaths = {
  outputDir,
  /** Back-to-back build A (paired stability). */
  pairA: join(outputDir, 'apiIndex.pairA.docs.json'),
  /** Back-to-back build B (paired stability). */
  pairB: join(outputDir, 'apiIndex.pairB.docs.json'),
  /** Latest single build (run B) — snapshot smoke tests, same role as org `apiIndex.docs.json`. */
  docs: join(outputDir, 'apiIndex.docs.json'),
  root: join(outputDir, 'apiIndex.dist-root.json'),
  meta: join(outputDir, 'audit-meta.json'),
  run: join(outputDir, 'audit-run.json'),
  buildLog: join(outputDir, 'build.log'),
}

export type AuditRun = {
  runId: string
  tier: 'audit'
}

export type AuditMeta = {
  tier: 'audit'
  gitSha: string | null
}

export function auditArtifactsReady(): boolean {
  return [
    auditPaths.pairA,
    auditPaths.pairB,
    auditPaths.docs,
    auditPaths.root,
    auditPaths.meta,
    auditPaths.run,
  ].every(existsSync)
}
