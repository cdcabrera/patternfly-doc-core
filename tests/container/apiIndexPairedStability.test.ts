/**
 * @jest-environment node
 */
import { existsSync } from 'fs'
import { join } from 'path'

import {
  canonicalJsonSha1,
  loadCanonicalJson,
  buildJsonReflection,
  diffJson,
  formatJsonDiff,
} from './utils/apiIndex'
import {
  compareApiIndexPair,
  formatPairCompareFailure,
} from './utils/compareApiIndexPair'

const containerDir = join(__dirname)
const pairedDir = join(containerDir, '.paired-record')

describe('patternfly-org apiIndex paired stability', () => {
  const run1Docs = join(pairedDir, 'run1', 'apiIndex.docs.json')
  const run2Docs = join(pairedDir, 'run2', 'apiIndex.docs.json')

  beforeAll(() => {
    if (!existsSync(run1Docs) || !existsSync(run2Docs)) {
      throw new Error(
        `Missing paired record under ${pairedDir}. ` +
          'Run npm run test:org:stability (requires podman or docker).',
      )
    }
  })

  it('produces identical canonical docs SHA-1 on two consecutive container builds', () => {
    const docs1 = loadCanonicalJson(run1Docs)
    const docs2 = loadCanonicalJson(run2Docs)
    const sha1 = canonicalJsonSha1(docs1)
    const sha2 = canonicalJsonSha1(docs2)

    expect(sha2).toBe(sha1)
  })

  it('matches structural reflection between consecutive builds', () => {
    const docs1 = loadCanonicalJson(run1Docs)
    const docs2 = loadCanonicalJson(run2Docs)
    const diff = diffJson(buildJsonReflection(docs1), buildJsonReflection(docs2), 50)

    if (diff.total > 0) {
      throw new Error(
        `Structural reflection differed (${diff.total} differences):\n${formatJsonDiff(diff)}`,
      )
    }
  })

  it('has stable examples keys and payloads (pair oracle)', () => {
    const result = compareApiIndexPair(run1Docs, run2Docs)
    if (!result.stable) {
      throw new Error(formatPairCompareFailure(result))
    }
  })
})
