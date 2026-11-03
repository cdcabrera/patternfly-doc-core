/* eslint-disable no-console */
import { join, isAbsolute, resolve } from 'path'
import { fileURLToPath } from 'url'
import { writeFile, mkdir, open, unlink, readFile, rename } from 'fs/promises'
import { getCollection } from 'astro:content'
import type { CollectionKey } from 'astro:content'
import { content } from '../../content'
import { kebabCase, addDemosOrDeprecated } from '../index'
import { getDefaultTabForApi } from '../packageUtils'
import { getOutputDir } from '../getOutputDir'
import { addSubsection } from '../case'
import { extractReactTokens } from '../extractReactTokens'
import { API_INDEX_COMPLETE_MARKER, getApiIndex } from './get'

const SOURCE_ORDER: Record<string, number> = {
  react: 1,
  'react-next': 1.1,
  'react-demos': 2,
  'react-deprecated': 2.1,
  html: 3,
  'html-demos': 4,
  'design-guidelines': 99,
  accessibility: 100,
  'upgrade-guide': 101,
  'release-notes': 102,
}

const sortSources = (s1: string, s2: string) => {
  const s1Index = SOURCE_ORDER[s1] || 50
  const s2Index = SOURCE_ORDER[s2] || 50
  if (s1Index === 50 && s2Index === 50) {
    return s1.localeCompare(s2)
  }
  return s1Index > s2Index ? 1 : -1
}

/**
 * Section item is always a string (subsections are kebab-cased and flattened into page names)
 */
export type SectionItem = string

/**
 * Structure of the API index used for routing and navigation
 * Keys in sections/pages/tabs use '::' separator (e.g., 'v6::components::alert')
 * Subsections are kebab-cased and flattened into page names with underscores (e.g., 'forms_checkbox')
 */
export interface ApiIndex {
  /** Available documentation versions (e.g., ['v5', 'v6']) */
  versions: string[]
  /** Sections by version - flat array of section names
   * (e.g., { 'v6': ['components', 'layouts', 'extensions'] })
   */
  sections: Record<string, SectionItem[]>
  /** Pages by version::section with subsections kebab-cased and flattened using underscores
   * (e.g., { 'v6::components': ['alert', 'button', 'forms_checkbox', 'menus_select'] })
   */
  pages: Record<string, string[]>
  /** Tabs by version::section::page where page may contain underscore-separated subsection
   * (e.g., { 'v6::components::alert': ['react'], 'v6::components::forms_checkbox': ['react'] })
   */
  tabs: Record<string, string[]>
  /** Documented React props members by version::section::page, in frontmatter order. */
  propComponents?: Record<string, string[]>
  /** Examples by version::section::page::tab with titles
   * (e.g., { 'v6::components::alert::react': [{exampleName: 'AlertDefault', title: 'Default alert'}] })
   */
  examples: Record<string, { exampleName: string; title: string | null }[]>
  /** CSS token objects by version::section::page (e.g., { 'v6::components::accordion': [{name: '--pf-v6-c-accordion--...', value: '...', var: '...'}] }) */
  css: Record<string, { name: string; value: string; var: string }[]>
}

/**
 * Extracts examples with titles from markdown/MDX content
 * Looks for <LiveExample src={ExampleName} /> patterns and finds associated H3 titles
 *
 * @param body - The raw markdown/MDX text content
 * @returns Array of unique examples with titles in document order
 */
function extractExamplesWithTitles(
  body: string
): { exampleName: string; title: string | null }[] {
  if (!body) {
    return []
  }

  // Match <LiveExample> tags with src attribute containing an example name
  // Supports various attribute orders and spacing patterns
  const exampleRegex = /<LiveExample[^>]*src=\{\s*(\w+)\s*\}[^>]*\/?>/g
  const examples: { exampleName: string; title: string | null }[] = []
  const seen = new Set<string>()
  let match

  // Find all examples and their positions
  while ((match = exampleRegex.exec(body)) !== null) {
    const exampleName = match[1]
    if (exampleName && !seen.has(exampleName)) {
      seen.add(exampleName)

      // Find the most recent h3 before this example
      const textBeforeExample = body.substring(0, match.index)
      const h3Matches = [...textBeforeExample.matchAll(/^### (.+)$/gm)]
      const title = h3Matches.length > 0 ? h3Matches[h3Matches.length - 1][1].trim() : null

      examples.push({ exampleName, title })
    }
  }

  return examples
}

function mergeExampleLists(
  existing: { exampleName: string; title: string | null }[],
  incoming: { exampleName: string; title: string | null }[],
): { exampleName: string; title: string | null }[] {
  const merged = [...existing]
  for (const ex of incoming) {
    if (!merged.some((item) => item.exampleName === ex.exampleName)) {
      merged.push(ex)
    }
  }
  return merged
}

type PrecomputedExamplesByKey = Record<
  string,
  { exampleName: string; title: string | null }[]
>

async function readPrecomputedExamplesByKey(
  outputDir: string,
): Promise<PrecomputedExamplesByKey | null> {
  const cachePath = join(outputDir, '.precomputed-examples.json')
  try {
    const raw = await readFile(cachePath, 'utf8')
    const parsed = JSON.parse(raw) as PrecomputedExamplesByKey
    if (Object.keys(parsed).length === 0) {
      return null
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function normalizeContentEntryFilePath(entry: {
  filePath?: string
  base?: string
}): string | undefined {
  if (!entry.filePath) {
    return undefined
  }

  let filePath = entry.filePath
  if (filePath.startsWith('file://')) {
    try {
      filePath = fileURLToPath(filePath)
    } catch {
      // keep original
    }
  }

  if (isAbsolute(filePath)) {
    return filePath
  }

  const astroRoot = process.env.PF_ASTRO_ROOT
  const cwd = process.cwd()
  const candidates = [
    entry.base ? resolve(entry.base, filePath) : undefined,
    astroRoot ? resolve(astroRoot, filePath) : undefined,
    resolve(cwd, filePath),
    entry.base ? resolve(cwd, entry.base, filePath) : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (isAbsolute(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

async function readContentEntryBody(entry: {
  filePath?: string
  body?: string
  base?: string
}): Promise<string> {
  if (!entry.filePath) {
    return entry.body || ''
  }

  const normalizedPath = normalizeContentEntryFilePath(entry)
  const astroRoot = process.env.PF_ASTRO_ROOT
  const cwd = process.cwd()
  let filePath = entry.filePath
  if (filePath.startsWith('file://')) {
    try {
      filePath = fileURLToPath(filePath)
    } catch {
      // keep original
    }
  }

  const readCandidates = [
    normalizedPath,
    entry.base && !isAbsolute(filePath) ? resolve(entry.base, filePath) : undefined,
    astroRoot && !isAbsolute(filePath) ? resolve(astroRoot, filePath) : undefined,
    !isAbsolute(filePath) ? resolve(cwd, filePath) : undefined,
    entry.base ? resolve(cwd, entry.base, filePath) : undefined,
    isAbsolute(filePath) ? filePath : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))

  const uniqueCandidates = [...new Set(readCandidates)]
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const candidate of uniqueCandidates) {
      try {
        return await readFile(candidate, 'utf8')
      } catch {
        // try next candidate
      }
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }

  return entry.body || ''
}

/**
 * Builds API index by analyzing all content collections.
 */
async function generateApiIndexFromCollections(): Promise<ApiIndex> {
  console.log('Generating API index from content collections...')

  const outputDir = await getOutputDir()
  const precomputedExamplesByKey = await readPrecomputedExamplesByKey(outputDir)
  const usePrecomputedExamples = Boolean(
    precomputedExamplesByKey &&
      Object.keys(precomputedExamplesByKey).length > 0,
  )

  const index: ApiIndex = {
    versions: [],
    sections: {},
    pages: {},
    tabs: {},
    propComponents: {},
    examples: {},
    css: {},
  }

  // Get all versions
  const versionSet = new Set<string>()
  content.forEach((entry: any) => {
    if (entry.version) {
      versionSet.add(entry.version)
    }
  })
  index.versions = Array.from(versionSet).sort()

  // For each version, collect index data
  for (const version of versionSet) {
    const collectionsToFetch = content
      .filter((entry: any) => entry.version === version)
      .map((entry: any) => entry.name as CollectionKey)
      .sort((a, b) => String(a).localeCompare(String(b)))

    const flatEntries: Array<
      Awaited<ReturnType<typeof getCollection>>[number] & { base?: string }
    > = []
    for (const name of collectionsToFetch) {
      const contentDef = content.find(
        (entry: any) => entry.name === name && entry.version === version,
      )
      const collectionEntries = await getCollection(name)
      for (const entry of collectionEntries) {
        flatEntries.push({ ...entry, base: contentDef?.base })
      }
    }
    flatEntries.sort((a, b) => String(a.filePath).localeCompare(String(b.filePath)))

    const mdSourcesWithMdx = new Set(
      flatEntries
        .map((entry) => entry.filePath)
        .filter((filePath): filePath is string => filePath?.endsWith('.mdx') ?? false)
        .map((filePath) => `${filePath.slice(0, -4)}.md`),
    )

    // Collect sections, pages, and tabs in a single pass
    const sections = new Set<string>()
    const sectionPages: Record<string, Set<string>> = {}
    const pageTabs: Record<string, Set<string>> = {}
    let tabExamples: Record<string, { exampleName: string; title: string | null }[]> = {}
    const pageCss: Record<string, { name: string; value: string; var: string }[]> = {}
    const pageCssPrefixes: Record<string, string | string[]> = {}
    const deprecatedPropComponents: Record<string, string[]> = {}

    for (const entry of flatEntries) {
      const { section, subsection, id } = entry.data
      if (!section) {
        continue
      }

      if (
        entry.filePath?.endsWith('.md') &&
        mdSourcesWithMdx.has(entry.filePath)
      ) {
        continue
      }

      const pathForTabLogic =
        normalizeContentEntryFilePath(entry) || String(entry.filePath || '')

      // Flatten subsections into page name using underscores
      // e.g., subsection="forms", id="checkbox" becomes page="forms_checkbox"
      const basePage = kebabCase(id)
      const page = addSubsection(basePage, subsection)

      // All pages are keyed by version::section (no subsection in key)
      const pageKey = `${version}::${section}`
      const tabKey = `${version}::${section}::${page}`

      // Collect section
      sections.add(section)

      // Collect page under section key
      if (!sectionPages[pageKey]) {
        sectionPages[pageKey] = new Set()
      }
      sectionPages[pageKey].add(page)

      // Collect tab
      const entryTab =
        entry.data.tab ||
        entry.data.source ||
        getDefaultTabForApi(pathForTabLogic)
      const tab = addDemosOrDeprecated(entryTab, pathForTabLogic)
      if (!pageTabs[tabKey]) {
        pageTabs[tabKey] = new Set()
      }
      pageTabs[tabKey].add(tab)

      // Prefer active React members, but retain deprecated-only pages such as Chip.
      if (tab === 'react' && entry.data.propComponents?.length) {
        index.propComponents![tabKey] = [...new Set<string>(entry.data.propComponents)]
      } else if (tab === 'react-deprecated' && entry.data.propComponents?.length) {
        deprecatedPropComponents[tabKey] = [...new Set<string>(entry.data.propComponents)]
      }

      // Collect examples for this tab — read source file; entry.body is flaky under Cloudflare prerender.
      if (!usePrecomputedExamples) {
        const exampleKey = `${tabKey}::${tab}`
        let examplesWithTitles = extractExamplesWithTitles(
          await readContentEntryBody(entry),
        )
        if (examplesWithTitles.length === 0 && typeof entry.body === 'string') {
          examplesWithTitles = extractExamplesWithTitles(entry.body)
        }
        if (examplesWithTitles.length > 0) {
          tabExamples[exampleKey] = mergeExampleLists(
            tabExamples[exampleKey] || [],
            examplesWithTitles,
          )
        }
      }

      // Collect CSS prefixes for pages - we'll extract tokens later
      // Key by version::section::page (tabKey) so each page gets its own tokens
      if (entry.data.cssPrefix && !pageCssPrefixes[tabKey]) {
        pageCssPrefixes[tabKey] = entry.data.cssPrefix
      }
    }

    Object.entries(deprecatedPropComponents).forEach(([key, propComponents]) => {
      if (!index.propComponents![key]) {
        index.propComponents![key] = propComponents
      }
    })

    // Extract CSS tokens for pages that have cssPrefix
    for (const [pageKey, cssPrefix] of Object.entries(pageCssPrefixes)) {
      try {
        const tokens = await extractReactTokens(cssPrefix)
        if (tokens.length > 0) {
          pageCss[pageKey] = tokens
        }
      } catch (error) {
        console.warn(`Failed to extract CSS tokens for ${pageKey}:`, error)
      }
    }

    // Convert sets to sorted arrays
    // Sections are now always flat strings (subsections are in page names)
    // Add hardcoded API endpoints (icons, tokens) to the sections list
    const allSections = new Set([...sections, 'icons', 'tokens'])
    index.sections[version] = Array.from(allSections).sort()

    Object.entries(sectionPages).forEach(([key, pages]) => {
      index.pages[key] = Array.from(pages).sort()
    })

    Object.entries(pageTabs).forEach(([key, tabs]) => {
      index.tabs[key] = Array.from(tabs).sort(sortSources)
    })

    if (usePrecomputedExamples && precomputedExamplesByKey) {
      tabExamples = {}
      for (const [key, examples] of Object.entries(precomputedExamplesByKey)) {
        if (!key.startsWith(`${version}::`)) {
          continue
        }
        tabExamples[key] = [...examples].sort((a, b) =>
          a.exampleName.localeCompare(b.exampleName),
        )
      }
    }

    Object.entries(tabExamples)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, examples]) => {
        index.examples[key] = [...examples].sort((a, b) =>
          a.exampleName.localeCompare(b.exampleName),
        )
      })

    // Add CSS token objects to index
    Object.entries(pageCss).forEach(([key, tokens]) => {
      index.css[key] = tokens
    })
  }

  return index
}

/** One in-process generation per build; avoids concurrent getCollection() during prerender. */
let generateApiIndexPromise: Promise<ApiIndex> | null = null

async function readCompleteApiIndexFromDisk(): Promise<ApiIndex | null> {
  try {
    const outputDir = await getOutputDir()
    const markerPath = join(outputDir, API_INDEX_COMPLETE_MARKER)
    try {
      await readFile(markerPath, 'utf8')
    } catch {
      return null
    }
    const index = await getApiIndex()
    if (index.versions.length > 0 && Object.keys(index.examples).length > 0) {
      return index
    }
  } catch {
    return null
  }
  return null
}

export async function generateAndPersistApiIndex(): Promise<ApiIndex> {
  const outputDir = await getOutputDir()
  const lockPath = join(outputDir, '.apiIndex.generating')
  const markerPath = join(outputDir, API_INDEX_COMPLETE_MARKER)

  for (let attempt = 0; attempt < 600; attempt++) {
    const onDisk = await readCompleteApiIndexFromDisk()
    if (onDisk) {
      return onDisk
    }

    try {
      const lockHandle = await open(lockPath, 'wx')
      await lockHandle.close()
      try {
        await unlink(markerPath).catch(() => undefined)
        const index = await generateApiIndexFromCollections()
        await writeApiIndex(index)
        return index
      } finally {
        await unlink(lockPath).catch(() => undefined)
      }
    } catch (error) {
      const errno = (error as NodeJS.ErrnoException).code
      if (errno !== 'EEXIST') {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  throw new Error('Timed out waiting for apiIndex.json generation')
}

/**
 * Generates API index by analyzing all content collections
 * Extracts versions, sections, pages, and tabs into a hierarchical structure
 * This runs during build time when getCollection() is available
 *
 * @returns Promise resolving to complete API index structure
 */
export async function generateApiIndex(): Promise<ApiIndex> {
  const onDisk = await readCompleteApiIndexFromDisk()
  if (onDisk) {
    return onDisk
  }

  if (!generateApiIndexPromise) {
    generateApiIndexPromise = generateAndPersistApiIndex().finally(() => {
      generateApiIndexPromise = null
    })
  }
  return generateApiIndexPromise
}

/**
 * Writes API index to a apiIndex.json file in the user defined output directory
 * This file is used by server-side API routes to avoid runtime getCollection() calls
 *
 * @param index - The API index structure to write
 */
export async function writeApiIndex(index: ApiIndex): Promise<void> {
  const outputDir = await getOutputDir()
  const indexPath = join(outputDir, 'apiIndex.json')

  try {
    await mkdir(outputDir, { recursive: true })
    const payload = JSON.stringify(index, null, 2)
    const tempPath = join(outputDir, `.apiIndex.${process.pid}.json.tmp`)
    await writeFile(tempPath, payload)
    await rename(tempPath, indexPath)
    const markerPath = join(outputDir, API_INDEX_COMPLETE_MARKER)
    await writeFile(markerPath, `${Date.now()}\n`)
    console.log(`✓ Generated API index with ${index.versions.length} versions`)
  } catch (error) {
    console.error('Could not write API index file:', error)
    throw error
  }
}

/**
 * Generates and writes API index in a single operation
 * Called during build in getStaticPaths to ensure index exists for server routes
 *
 * @returns Promise resolving to the generated API index
 */
export async function generateAndWriteApiIndex(): Promise<ApiIndex> {
  return generateAndPersistApiIndex()
}
