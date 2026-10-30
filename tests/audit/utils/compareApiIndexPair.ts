import { createHash } from 'crypto'
import { readFileSync } from 'fs'

type ApiIndexLike = {
  examples: Record<string, unknown>
  pages?: unknown
  tabs?: unknown
  css?: unknown
  propComponents?: unknown
}

export type ApiIndexPairCompare = {
  shaA: string
  shaB: string
  keysA: number
  keysB: number
  onlyA: string[]
  onlyB: string[]
  overlapSame: number
  overlapDiff: number
  structureOk: Record<'pages' | 'tabs' | 'css' | 'propComponents', boolean>
  stable: boolean
  exitClass: 0 | 1 | 2
}

function load(path: string): ApiIndexLike {
  return JSON.parse(readFileSync(path, 'utf8')) as ApiIndexLike
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Same semantics as compare-api-index-pair.mjs (FIX loop oracle). */
export function compareApiIndexPair(pathA: string, pathB: string): ApiIndexPairCompare {
  const A = load(pathA)
  const B = load(pathB)
  const setB = new Set(Object.keys(B.examples))
  const onlyA = Object.keys(A.examples)
    .filter((k) => !setB.has(k))
    .sort()
  const onlyB = Object.keys(B.examples)
    .filter((k) => !(k in A.examples))
    .sort()

  let overlapSame = 0
  let overlapDiff = 0
  for (const k of Object.keys(A.examples)) {
    if (!(k in B.examples)) continue
    if (JSON.stringify(A.examples[k]) === JSON.stringify(B.examples[k])) overlapSame++
    else overlapDiff++
  }

  const shaA = sha256File(pathA)
  const shaB = sha256File(pathB)
  const structureOk = {
    pages: JSON.stringify(A.pages) === JSON.stringify(B.pages),
    tabs: JSON.stringify(A.tabs) === JSON.stringify(B.tabs),
    css: JSON.stringify(A.css) === JSON.stringify(B.css),
    propComponents: JSON.stringify(A.propComponents) === JSON.stringify(B.propComponents),
  }

  let exitClass: 0 | 1 | 2 = 1
  if (overlapDiff > 0) exitClass = 2
  else if (shaA === shaB && onlyA.length === 0) exitClass = 0

  return {
    shaA,
    shaB,
    keysA: Object.keys(A.examples).length,
    keysB: Object.keys(B.examples).length,
    onlyA,
    onlyB,
    overlapSame,
    overlapDiff,
    structureOk,
    stable: exitClass === 0,
    exitClass,
  }
}

export function formatPairCompareFailure(result: ApiIndexPairCompare): string {
  const lines = [
    `paired apiIndex audit failed (exit class ${result.exitClass})`,
    `SHA A ${result.shaA}`,
    `SHA B ${result.shaB}`,
    `keys ${result.keysA} ${result.keysB}`,
    `onlyA ${result.onlyA.length} onlyB ${result.onlyB.length} overlapSame ${result.overlapSame} overlapDiff ${result.overlapDiff}`,
    ...Object.entries(result.structureOk).map(([k, ok]) => `${k} ${ok ? 'ok' : 'DIFF'}`),
  ]
  if (result.onlyA.length > 0) {
    lines.push('--- only A ---', ...result.onlyA.slice(0, 40))
    if (result.onlyA.length > 40) lines.push(`… +${result.onlyA.length - 40} more`)
  }
  if (result.onlyB.length > 0) {
    lines.push('--- only B ---', ...result.onlyB.slice(0, 40))
    if (result.onlyB.length > 40) lines.push(`… +${result.onlyB.length - 40} more`)
  }
  return lines.join('\n')
}
