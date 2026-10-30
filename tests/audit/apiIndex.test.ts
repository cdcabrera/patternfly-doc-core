/**
 * @jest-environment node
 */
import { existsSync, mkdirSync, readFileSync } from 'fs'

import {
  buildJsonReflection,
  canonicalJsonSha1,
  diffJson,
  formatJsonDiff,
  loadCanonicalJson,
} from '../container/utils/apiIndex'
import {
  compareApiIndexPair,
  formatPairCompareFailure,
} from './utils/compareApiIndexPair'
import { auditPaths, type AuditMeta, type AuditRun } from './utils/paths'

function readAuditRun(): AuditRun {
  return JSON.parse(readFileSync(auditPaths.run, 'utf8')) as AuditRun
}

function readAuditMeta(): AuditMeta {
  return JSON.parse(readFileSync(auditPaths.meta, 'utf8')) as AuditMeta
}

describe('doc-core apiIndex paired build', () => {
  beforeAll(() => {
    mkdirSync(auditPaths.outputDir, { recursive: true })
    for (const path of [
      auditPaths.pairA,
      auditPaths.pairB,
      auditPaths.docs,
      auditPaths.root,
      auditPaths.meta,
      auditPaths.run,
    ]) {
      if (!existsSync(path)) {
        throw new Error(
          `Missing ${path}. Run npm run test:audit (builds twice, then Jest).`,
        )
      }
    }

    const run = readAuditRun()
    const meta = readAuditMeta()
    expect(run.tier).toBe('audit')
    expect(meta.tier).toBe('audit')
  })

  it('paired back-to-back builds produce byte-identical audit JSON', () => {
    const result = compareApiIndexPair(auditPaths.pairA, auditPaths.pairB)
    if (!result.stable) {
      throw new Error(formatPairCompareFailure(result))
    }
  })

  it('matches the sorted JSON SHA-1 smoke snapshot', () => {
    const docs = loadCanonicalJson(auditPaths.docs)
    expect(canonicalJsonSha1(docs)).toMatchSnapshot('audit-sorted-sha1')
  })

  it('matches the compact structural reflection', () => {
    const docs = loadCanonicalJson(auditPaths.docs)
    const reflection = buildJsonReflection(docs)

    expect(reflection).toMatchSnapshot('audit-structural-reflection')
  })

  it('reports docs and root index differences from the same build', () => {
    const docs = loadCanonicalJson(auditPaths.docs)
    const root = loadCanonicalJson(auditPaths.root)
    const diff = diffJson(docs, root)

    if (diff.total > 0) {
      throw new Error(
        `docs and root apiIndex.json differ (${diff.total} differences):\n${formatJsonDiff(diff)}`,
      )
    }
  })
})
