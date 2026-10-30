import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import { glob } from 'glob'
import { kebabCase as kebabCaseOriginal } from 'change-case'
import type { DocsConfig } from './getConfig.js'
import { resolveContentEntryGlob } from './createCollectionContent.js'

const LIVE_EXAMPLE_REGEX = /<LiveExample[^>]*src=\{\s*(\w+)\s*\}[^>]*\/?>/g

export type ExampleEntry = { exampleName: string; title: string | null }

export type PrecomputedExamplesByKey = Record<string, ExampleEntry[]>

const fixPatternflyCasing = (id: string) => id.replace('PatternFly', 'Patternfly')

const kebabCase = (id: string) => kebabCaseOriginal(fixPatternflyCasing(id))

const addSubsection = (page: string, subsection?: string) =>
  subsection ? `${kebabCase(subsection)}_${page}` : page

const getPackageName = (filePath?: string): string => {
  if (!filePath) {
    return ''
  }
  const normalizedPath = filePath.replace(/\\/g, '/')
  const splitPath = normalizedPath.split('/')
  if (normalizedPath.includes('node_modules/@')) {
    const scopeIndex = splitPath.findIndex((path) => path.startsWith('@'))
    return `${splitPath[scopeIndex]}/${splitPath[scopeIndex + 1]}`
  }
  const nodeModulesIndex = splitPath.findIndex((path) => path === 'node_modules')
  return nodeModulesIndex === -1 ? '' : splitPath[nodeModulesIndex + 1] || ''
}

const getDefaultTabForApi = (filePath?: string): string => {
  const packageName = getPackageName(filePath)
  const tabBase =
    packageName === '@patternfly/patternfly'
      ? 'html'
      : packageName === '@patternfly/react-core'
        ? 'react'
        : ''
  return addDemosOrDeprecated(tabBase, filePath) || 'text'
}

const addDemosOrDeprecated = (tabName: string, filePath?: string) => {
  if (!filePath || !tabName) {
    return ''
  }
  let tab = tabName
  if (filePath.includes('demos') && !tab.includes('-demos')) {
    tab += '-demos'
  }
  if (filePath.includes('deprecated') && !tab.includes('-deprecated')) {
    tab += '-deprecated'
  }
  return tab
}

function extractExamplesWithTitles(body: string): ExampleEntry[] {
  if (!body) {
    return []
  }

  const examples: ExampleEntry[] = []
  const seen = new Set<string>()
  let match

  while ((match = LIVE_EXAMPLE_REGEX.exec(body)) !== null) {
    const exampleName = match[1]
    if (exampleName && !seen.has(exampleName)) {
      seen.add(exampleName)
      const textBeforeExample = body.substring(0, match.index)
      const h3Matches = [...textBeforeExample.matchAll(/^### (.+)$/gm)]
      const title =
        h3Matches.length > 0 ? h3Matches[h3Matches.length - 1][1].trim() : null
      examples.push({ exampleName, title })
    }
  }

  return examples
}

function parseFrontmatterFields(content: string): Record<string, string | undefined> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return {}
  }

  const block = match[1]
  const pick = (key: string) => {
    const line = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    if (!line) {
      return undefined
    }
    return line[1].replace(/^['"]|['"]$/g, '').trim()
  }

  return {
    section: pick('section'),
    subsection: pick('subsection'),
    id: pick('id'),
    tab: pick('tab'),
    source: pick('source'),
  }
}

function mergeExampleLists(
  existing: ExampleEntry[],
  incoming: ExampleEntry[],
): ExampleEntry[] {
  const merged = [...existing]
  for (const ex of incoming) {
    if (!merged.some((item) => item.exampleName === ex.exampleName)) {
      merged.push(ex)
    }
  }
  return merged
}

export async function precomputeExamplesByKey(
  config: DocsConfig,
  configDir: string,
): Promise<PrecomputedExamplesByKey> {
  const repoRootDir = config.repoRoot
    ? resolve(configDir, config.repoRoot)
    : configDir
  const byKey: PrecomputedExamplesByKey = {}

  for (const contentObj of config.content ?? []) {
    const version = contentObj.version || 'v6'
    const globPath = resolveContentEntryGlob(
      contentObj,
      configDir,
      repoRootDir,
      false,
    )
    if (!globPath) {
      continue
    }

    const files = (await glob(globPath)).sort()
    const mdWithMdx = new Set(
      files
        .filter((filePath) => filePath.endsWith('.mdx'))
        .map((filePath) => `${filePath.slice(0, -4)}.md`),
    )

    for (const filePath of files) {
      if (filePath.endsWith('.md') && mdWithMdx.has(filePath)) {
        continue
      }

      const body = await readFile(filePath, 'utf8')
      const examples = extractExamplesWithTitles(body)
      if (examples.length === 0) {
        continue
      }

      const meta = parseFrontmatterFields(body)
      if (!meta.section || !meta.id) {
        continue
      }

      const page = addSubsection(kebabCase(meta.id), meta.subsection)
      const tabKey = `${version}::${meta.section}::${page}`
      const entryTab =
        meta.tab || meta.source || getDefaultTabForApi(resolve(filePath))
      const tab = addDemosOrDeprecated(entryTab, resolve(filePath))
      const exampleKey = `${tabKey}::${tab}`

      byKey[exampleKey] = mergeExampleLists(byKey[exampleKey] || [], examples)
    }
  }

  return byKey
}

export async function writePrecomputedExamplesCache(
  outputDir: string,
  byKey: PrecomputedExamplesByKey,
): Promise<string> {
  const cachePath = join(outputDir, '.precomputed-examples.json')
  await mkdir(outputDir, { recursive: true })
  await writeFile(cachePath, `${JSON.stringify(byKey, null, 2)}\n`)
  return cachePath
}

export async function readPrecomputedExamplesCache(
  outputDir: string,
): Promise<PrecomputedExamplesByKey | null> {
  const cachePath = join(outputDir, '.precomputed-examples.json')
  try {
    const raw = await readFile(cachePath, 'utf8')
    return JSON.parse(raw) as PrecomputedExamplesByKey
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}
