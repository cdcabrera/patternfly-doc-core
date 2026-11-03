/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

const outputDir = join(__dirname, 'output', 'run1')
const docsPath = join(outputDir, 'apiIndex.docs.json')
const rootPath = join(outputDir, 'apiIndex.dist-root.json')

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

describe('PatternFly Org apiIndex Audit', () => {
  beforeAll(() => {
    if (!existsSync(docsPath)) {
      throw new Error(`Missing ${docsPath}. Run tests/container/run.sh first.`)
    }
  })

  it('matches canonical SHA-1 snapshot', () => {
    const sha1 = getCanonicalSha1(docsPath)
    expect(sha1).toMatchSnapshot('canonical-docs-sha1')
  })

  it('publishes the docs apiIndex unchanged at the root output', () => {
    expect(existsSync(rootPath)).toBe(true)
    expect(readFileSync(rootPath, 'utf-8')).toBe(readFileSync(docsPath, 'utf-8'))
  })
})
