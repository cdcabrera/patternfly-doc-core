/**
 * @jest-environment node
 */
import {
  buildJsonReflection,
  canonicalJsonSha1,
  canonicalJsonString,
  diffJson,
  formatJsonDiff,
} from './utils/apiIndex'
import type { JsonValue } from './utils/apiIndex'

describe('apiIndex audit helpers', () => {
  it('sorts object keys before serializing and hashing', () => {
    const first: JsonValue = {
      z: { beta: 2, alpha: 1 },
      a: [{ y: true, x: false }],
    }
    const reordered: JsonValue = {
      a: [{ x: false, y: true }],
      z: { alpha: 1, beta: 2 },
    }

    expect(canonicalJsonString(first)).toBe(canonicalJsonString(reordered))
    expect(canonicalJsonSha1(first)).toBe(canonicalJsonSha1(reordered))
  })

  it('preserves array order as part of the fingerprint', () => {
    expect(canonicalJsonSha1({ values: ['first', 'second'] })).not.toBe(
      canonicalJsonSha1({ values: ['second', 'first'] }),
    )
  })

  it('reflects sorted root properties and aggregates descendants without content', () => {
    const reflection = buildJsonReflection({
      z: { records: [{ label: 'one' }, { label: 'two' }] },
      a: ['first', true],
    })

    expect(Object.keys(reflection)).toEqual(['a', 'z'])
    expect(Object.keys(reflection.z.nextTier ?? {})).toEqual([
      'arrayItems',
      'arrays',
      'objectProperties',
      'objects',
      'strings',
    ])
    expect(reflection).toEqual({
      a: {
        count: 2,
        nextTier: { booleans: 1, strings: 1 },
        type: 'array',
      },
      z: {
        count: 1,
        nextTier: {
          arrayItems: 2,
          arrays: 1,
          objectProperties: 2,
          objects: 2,
          strings: 2,
        },
        type: 'object',
      },
    })
    expect(JSON.stringify(reflection)).not.toContain('records')
    expect(JSON.stringify(reflection)).not.toContain('one')
  })

  it('reports bounded dynamic diffs using JSON Pointer paths', () => {
    const diff = diffJson(
      { retained: true, old: { value: 1 }, list: ['first'] },
      { retained: true, added: { value: 2 }, list: ['first', 'second'] },
      2,
    )

    expect(diff.total).toBe(3)
    expect(diff.entries).toEqual([
      {
        kind: 'added',
        path: '/added',
        received: '{"value":2}',
      },
      {
        kind: 'added',
        path: '/list/1',
        received: '"second"',
      },
    ])
    expect(formatJsonDiff(diff)).toContain('... 1 additional differences')
  })
})
