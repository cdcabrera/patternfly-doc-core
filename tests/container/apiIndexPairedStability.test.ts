/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

import {
  compareApiIndexPair,
  formatPairCompareFailure,
} from './compareApiIndexPair'

const outputDir = join(__dirname, 'output')
const run1Docs = join(outputDir, 'run1', 'apiIndex.docs.json')
const run2Docs = join(outputDir, 'run2', 'apiIndex.docs.json')
const run1Root = join(outputDir, 'run1', 'apiIndex.dist-root.json')
const run2Root = join(outputDir, 'run2', 'apiIndex.dist-root.json')
const run1Audit = join(outputDir, 'run1', 'audit-run.txt')
const run2Audit = join(outputDir, 'run2', 'audit-run.txt')

function canonicalizeJson(value: any): any {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])])
    )
  }
  return value
}

function getCanonicalSha1(filePath: string): string {
  const raw = readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw)
  const canonical = JSON.stringify(canonicalizeJson(parsed))
  return crypto.createHash('sha1').update(canonical).digest('hex')
}

function getAuditRunId(filePath: string): string | undefined {
  return readFileSync(filePath, 'utf-8').trim() || undefined
}

describe('PatternFly Org apiIndex paired stability', () => {
  beforeAll(() => {
    if (
      !existsSync(run1Docs) ||
      !existsSync(run2Docs) ||
      !existsSync(run1Root) ||
      !existsSync(run2Root) ||
      !existsSync(run1Audit) ||
      !existsSync(run2Audit)
    ) {
      throw new Error(
        `Missing paired apiIndex under ${outputDir}/run1 and run2. ` +
          'Run tests/container/run.sh first.',
      )
    }
  })

  it('executes both intentional runtime builds before comparison', () => {
    expect(getAuditRunId(run1Audit)).toBe('run1')
    expect(getAuditRunId(run2Audit)).toBe('run2')
  })

  it('produces identical canonical docs SHA-1 on two consecutive org builds', () => {
    expect(getCanonicalSha1(run2Docs)).toBe(getCanonicalSha1(run1Docs))
  })

  it('publishes Astro\'s finished index unchanged at the root output', () => {
    expect(readFileSync(run1Root, 'utf-8')).toBe(readFileSync(run1Docs, 'utf-8'))
    expect(readFileSync(run2Root, 'utf-8')).toBe(readFileSync(run2Docs, 'utf-8'))
  })

  it('has stable examples keys and payloads (pair oracle)', () => {
    const result = compareApiIndexPair(run1Docs, run2Docs)
    if (!result.stable) {
      throw new Error(formatPairCompareFailure(result))
    }
  })
})
