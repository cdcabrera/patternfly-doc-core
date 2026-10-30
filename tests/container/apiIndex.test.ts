/**
 * @jest-environment node
 */
import { existsSync, mkdirSync } from 'fs'

import {
  apiIndexPaths,
  buildJsonReflection,
  canonicalJsonSha1,
  diffJson,
  formatJsonDiff,
  loadCanonicalJson,
  readAuditMeta,
  readAuditRun,
  writeReflectionDebug,
} from './utils/apiIndex'
import type { AuditSource } from './utils/apiIndex'

function requestedSource(): AuditSource {
  const meta = readAuditMeta()
  const source = meta.source
  if (source !== 'default' && source !== 'local' && source !== 'npm') {
    throw new Error(
      `doc-core metadata has unsupported source '${String(source)}'`,
    )
  }
  return source
}

describe('patternfly-org apiIndex build', () => {
  const source = requestedSource()

  beforeAll(() => {
    mkdirSync(apiIndexPaths.outputDir, { recursive: true })
    for (const path of [
      apiIndexPaths.docs,
      apiIndexPaths.root,
      apiIndexPaths.meta,
      apiIndexPaths.run,
    ]) {
      if (!existsSync(path)) {
        throw new Error(
          `Missing ${path}. Run npm run test:org (requires podman or docker).`,
        )
      }
    }

    const run = readAuditRun()
    const meta = readAuditMeta()
    expect(run.source).toBe(source)
    expect(meta.source).toBe(source)
  })

  it('matches the sorted JSON SHA-1 smoke snapshot for its source mode', () => {
    const docs = loadCanonicalJson(apiIndexPaths.docs)

    expect(canonicalJsonSha1(docs)).toMatchSnapshot(`${source}-sorted-sha1`)
  })

  it('matches the compact structural reflection for its source mode', () => {
    const docs = loadCanonicalJson(apiIndexPaths.docs)
    const reflection = buildJsonReflection(docs)
    writeReflectionDebug(reflection)

    expect(reflection).toMatchSnapshot(`${source}-structural-reflection`)
  })

  it('reports docs and root index differences from the same build', () => {
    const docs = loadCanonicalJson(apiIndexPaths.docs)
    const root = loadCanonicalJson(apiIndexPaths.root)
    const diff = diffJson(docs, root)

    if (diff.total > 0) {
      throw new Error(
        `docs and root apiIndex.json differ (${diff.total} differences):\n${formatJsonDiff(diff)}`,
      )
    }
  })
})
