import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const containerDir = join(__dirname, '..')

export const apiIndexPaths = {
  docs: join(containerDir, 'output', 'apiIndex.docs.json'),
  root: join(containerDir, 'output', 'apiIndex.dist-root.json'),
  outputDir: join(containerDir, 'output'),
  meta: join(containerDir, 'output', 'doc-core-meta.json'),
  run: join(containerDir, 'output', 'audit-run.json'),
  fingerprintDebug: join(containerDir, 'output', 'apiIndex.manifest.json'),
  buildLog: join(containerDir, 'output', 'build.log'),
}

export type JsonPrimitive = boolean | null | number | string
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type AuditSource = 'default' | 'local' | 'npm'

export type AuditRun = {
  runId: string
  source: AuditSource
}

export type ApiIndexCounts = {
  versions: number
  sectionKeys: number
  sectionNames: number
  pageKeys: number
  pageSlugs: number
  tabKeys: number
  tabIds: number
  exampleKeys: number
  exampleNames: number
  propComponentKeys: number
  cssPaths: number
  cssTokens: number
}

export type JsonPropertySummary = {
  type: string
  keys?: string[]
  length?: number
}

export type JsonFingerprint = {
  sha1: string
  counts: ApiIndexCounts
  properties: Record<string, JsonPropertySummary>
}

/**
 * Counts the structure below one root apiIndex property without retaining
 * property names, array items, or primitive values.
 */
export type JsonReflectionCounts = Partial<{
  arrayItems: number
  arrays: number
  booleans: number
  nulls: number
  numbers: number
  objectProperties: number
  objects: number
  strings: number
}>

/** A compact, content-free reflection of one root apiIndex property. */
export type JsonPropertyReflection = {
  type: string
  count?: number
  nextTier?: JsonReflectionCounts
}

/**
 * One sorted entry per root property. Nested data is represented only by
 * aggregate structural counts so the audit snapshot stays small.
 */
export type JsonReflection = Record<string, JsonPropertyReflection>

export type JsonDifference = {
  path: string
  kind: 'added' | 'removed' | 'type' | 'value'
  expected?: string
  received?: string
}

export type JsonDiff = {
  total: number
  entries: JsonDifference[]
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonType(value: JsonValue): string {
  if (Array.isArray(value)) {
    return 'array'
  }
  if (value === null) {
    return 'null'
  }
  return typeof value
}

function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

function appendPointer(path: string, token: string): string {
  return `${path}/${escapePointerToken(token)}`
}

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

/**
 * Sorts object keys recursively while preserving array order. Arrays can be
 * user-visible API data, so changing their order remains an audit failure.
 */
export function canonicalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson)
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])]),
    )
  }
  return value
}

export function canonicalJsonString(value: JsonValue): string {
  return JSON.stringify(canonicalizeJson(value))
}

export function canonicalJsonSha1(value: JsonValue): string {
  return sha1(canonicalJsonString(value))
}

export function loadCanonicalJson(path: string): JsonValue {
  return canonicalizeJson(JSON.parse(readFileSync(path, 'utf8')) as JsonValue)
}

function increment(
  counts: JsonReflectionCounts,
  key: keyof JsonReflectionCounts,
  amount = 1,
): void {
  counts[key] = (counts[key] ?? 0) + amount
}

function collectDescendants(
  value: JsonValue,
  counts: JsonReflectionCounts,
): void {
  if (Array.isArray(value)) {
    increment(counts, 'arrays')
    increment(counts, 'arrayItems', value.length)
    value.forEach((item) => collectDescendants(item, counts))
    return
  }

  if (isJsonObject(value)) {
    const values = Object.values(value)
    increment(counts, 'objects')
    increment(counts, 'objectProperties', values.length)
    values.forEach((item) => collectDescendants(item, counts))
    return
  }

  if (value === null) {
    increment(counts, 'nulls')
  } else if (typeof value === 'boolean') {
    increment(counts, 'booleans')
  } else if (typeof value === 'number') {
    increment(counts, 'numbers')
  } else {
    increment(counts, 'strings')
  }
}

function directCount(value: JsonValue): number | undefined {
  if (Array.isArray(value)) {
    return value.length
  }
  if (isJsonObject(value)) {
    return Object.keys(value).length
  }
  return undefined
}

/**
 * Reflects every root property dynamically. Object keys are sorted, while
 * descendants are aggregated into counts rather than emitted as content.
 */
export function buildJsonReflection(value: JsonValue): JsonReflection {
  const canonical = canonicalizeJson(value)
  if (!isJsonObject(canonical)) {
    return {}
  }

  return Object.fromEntries(
    Object.keys(canonical)
      .sort()
      .map((key) => {
        const property = canonical[key]
        const nextTier: JsonReflectionCounts = {}

        if (Array.isArray(property)) {
          property.forEach((item) => collectDescendants(item, nextTier))
        } else if (isJsonObject(property)) {
          Object.values(property).forEach((item) =>
            collectDescendants(item, nextTier),
          )
        }

        const count = directCount(property)
        const reflection: JsonPropertyReflection = {
          type: jsonType(property),
          ...(count === undefined ? {} : { count }),
          ...(Object.keys(nextTier).length === 0 ? {} : { nextTier }),
        }

        return [key, canonicalizeJson(reflection as JsonValue)]
      }),
  ) as JsonReflection
}

function record(value: JsonValue | undefined): { [key: string]: JsonValue } {
  return value !== undefined && isJsonObject(value) ? value : {}
}

function arrayLength(value: JsonValue | undefined): number {
  return Array.isArray(value) ? value.length : 0
}

function countRecordArrays(value: JsonValue | undefined): number {
  return Object.values(record(value)).reduce<number>(
    (count, item) => count + arrayLength(item),
    0,
  )
}

function buildApiIndexCounts(value: JsonValue): ApiIndexCounts {
  const index = record(value)
  const sections = record(index.sections)
  const pages = record(index.pages)
  const tabs = record(index.tabs)
  const examples = record(index.examples)
  const propComponents = record(index.propComponents)
  const css = record(index.css)

  return {
    versions: arrayLength(index.versions),
    sectionKeys: Object.keys(sections).length,
    sectionNames: countRecordArrays(sections),
    pageKeys: Object.keys(pages).length,
    pageSlugs: countRecordArrays(pages),
    tabKeys: Object.keys(tabs).length,
    tabIds: countRecordArrays(tabs),
    exampleKeys: Object.keys(examples).length,
    exampleNames: countRecordArrays(examples),
    propComponentKeys: Object.keys(propComponents).length,
    cssPaths: Object.keys(css).length,
    cssTokens: countRecordArrays(css),
  }
}

function summarizeProperty(value: JsonValue): JsonPropertySummary {
  if (isJsonObject(value)) {
    return {
      type: 'object',
      keys: Object.keys(value),
    }
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
    }
  }
  return { type: jsonType(value) }
}

/**
 * Snapshots useful apiIndex section counts plus a generic, sorted summary of
 * each root property. A single canonical document hash catches every nested
 * change without emitting a hash for every nested property.
 */
export function buildJsonFingerprint(value: JsonValue): JsonFingerprint {
  const canonical = canonicalizeJson(value)
  const properties = isJsonObject(canonical)
    ? Object.fromEntries(
        Object.keys(canonical).map((key) => [
          key,
          summarizeProperty(canonical[key]),
        ]),
      )
    : {}

  return {
    sha1: sha1(JSON.stringify(canonical)),
    counts: buildApiIndexCounts(canonical),
    properties,
  }
}

function describeJson(value: JsonValue): string {
  const text = JSON.stringify(value)
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function addDifference(
  diff: JsonDiff,
  entry: JsonDifference,
  limit: number,
): void {
  diff.total += 1
  if (diff.entries.length < limit) {
    diff.entries.push(entry)
  }
}

function diffValues(
  expected: JsonValue,
  received: JsonValue,
  path: string,
  diff: JsonDiff,
  limit: number,
): void {
  const expectedType = jsonType(expected)
  const receivedType = jsonType(received)
  if (expectedType !== receivedType) {
    addDifference(
      diff,
      {
        path,
        kind: 'type',
        expected: expectedType,
        received: receivedType,
      },
      limit,
    )
    return
  }

  if (Array.isArray(expected) && Array.isArray(received)) {
    const length = Math.max(expected.length, received.length)
    for (let index = 0; index < length; index += 1) {
      const childPath = appendPointer(path, String(index))
      if (index >= expected.length) {
        addDifference(
          diff,
          {
            path: childPath,
            kind: 'added',
            received: describeJson(received[index]),
          },
          limit,
        )
      } else if (index >= received.length) {
        addDifference(
          diff,
          {
            path: childPath,
            kind: 'removed',
            expected: describeJson(expected[index]),
          },
          limit,
        )
      } else {
        diffValues(expected[index], received[index], childPath, diff, limit)
      }
    }
    return
  }

  if (isJsonObject(expected) && isJsonObject(received)) {
    const keys = [
      ...new Set([...Object.keys(expected), ...Object.keys(received)]),
    ].sort()
    keys.forEach((key) => {
      const childPath = appendPointer(path, key)
      if (!(key in expected)) {
        addDifference(
          diff,
          {
            path: childPath,
            kind: 'added',
            received: describeJson(received[key]),
          },
          limit,
        )
      } else if (!(key in received)) {
        addDifference(
          diff,
          {
            path: childPath,
            kind: 'removed',
            expected: describeJson(expected[key]),
          },
          limit,
        )
      } else {
        diffValues(expected[key], received[key], childPath, diff, limit)
      }
    })
    return
  }

  if (expected !== received) {
    addDifference(
      diff,
      {
        path,
        kind: 'value',
        expected: describeJson(expected),
        received: describeJson(received),
      },
      limit,
    )
  }
}

export function diffJson(
  expected: JsonValue,
  received: JsonValue,
  limit = 25,
): JsonDiff {
  const diff: JsonDiff = { total: 0, entries: [] }
  diffValues(
    canonicalizeJson(expected),
    canonicalizeJson(received),
    '',
    diff,
    limit,
  )
  return diff
}

export function formatJsonDiff(diff: JsonDiff): string {
  if (diff.total === 0) {
    return 'No JSON differences'
  }

  const lines = diff.entries.map((entry) => {
    const path = entry.path || '/'
    const expected = entry.expected ? ` expected=${entry.expected}` : ''
    const received = entry.received ? ` received=${entry.received}` : ''
    return `${path} ${entry.kind}${expected}${received}`
  })
  if (diff.total > diff.entries.length) {
    lines.push(`... ${diff.total - diff.entries.length} additional differences`)
  }
  return lines.join('\n')
}

export function readAuditRun(path = apiIndexPaths.run): AuditRun {
  const run = JSON.parse(readFileSync(path, 'utf8')) as Partial<AuditRun>
  if (!run.runId || !['default', 'local', 'npm'].includes(run.source ?? '')) {
    throw new Error(`Invalid audit run marker at ${path}`)
  }
  return run as AuditRun
}

export function readAuditMeta(path = apiIndexPaths.meta): { source?: unknown } {
  return JSON.parse(readFileSync(path, 'utf8')) as { source?: unknown }
}

export function writeFingerprintDebug(fingerprint: JsonFingerprint): void {
  writeFileSync(
    apiIndexPaths.fingerprintDebug,
    `${JSON.stringify(fingerprint, null, 2)}\n`,
  )
}

export function writeReflectionDebug(reflection: JsonReflection): void {
  writeFileSync(
    apiIndexPaths.fingerprintDebug,
    `${JSON.stringify(reflection, null, 2)}\n`,
  )
}
