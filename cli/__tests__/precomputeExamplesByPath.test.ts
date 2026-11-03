import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  precomputeExamplesByKey,
  writePrecomputedExamplesCache,
  readPrecomputedExamplesCache,
} from '../precomputeExamplesByPath.js'
import type { DocsConfig } from '../getConfig.js'

describe('precomputeExamplesByKey', () => {
  let tempRoot = ''
  let configDir = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'pf-precompute-'))
    configDir = join(tempRoot, 'site')
    await mkdir(join(configDir, 'src', 'content', 'components', 'alert'), {
      recursive: true,
    })
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('builds stable example keys from MDX with LiveExample tags', async () => {
    const mdxPath = join(
      configDir,
      'src/content/components/alert/Alert.mdx',
    )
    await writeFile(
      mdxPath,
      `---
section: components
id: Alert
---
### Default
<LiveExample src={AlertBasic} />
`,
    )

    const config: DocsConfig = {
      outputDir: 'dist',
      propsGlobs: [],
      content: [
        {
          name: 'content',
          base: 'src/content',
          pattern: '**/*.{md,mdx}',
          version: 'v6',
        },
      ],
    }

    const first = await precomputeExamplesByKey(config, configDir)
    const second = await precomputeExamplesByKey(config, configDir)

    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort())
    expect(first['v6::components::alert::text']).toEqual([
      { exampleName: 'AlertBasic', title: 'Default' },
    ])
  })

  it('skips .md when sibling .mdx exists', async () => {
    const base = join(configDir, 'src/content/components/button')
    await mkdir(base, { recursive: true })
    await writeFile(
      join(base, 'Button.md'),
      `---
section: components
id: Button
---
### Should ignore
<LiveExample src={Ignored} />
`,
    )
    await writeFile(
      join(base, 'Button.mdx'),
      `---
section: components
id: Button
---
### From MDX
<LiveExample src={ButtonBasic} />
`,
    )

    const config: DocsConfig = {
      outputDir: 'dist',
      propsGlobs: [],
      content: [
        {
          name: 'content',
          base: 'src/content',
          pattern: '**/*.{md,mdx}',
          version: 'v6',
        },
      ],
    }

    const byKey = await precomputeExamplesByKey(config, configDir)
    const examples = byKey['v6::components::button::text'] ?? []
    expect(examples.map((item) => item.exampleName)).toEqual(['ButtonBasic'])
  })

  it('writes and reads precomputed cache round-trip', async () => {
    const outDir = join(tempRoot, 'dist')
    const sample = {
      'v6::components::alert::react': [
        { exampleName: 'AlertBasic', title: 'Default' },
      ],
    }
    await writePrecomputedExamplesCache(outDir, sample)
    const raw = await readFile(join(outDir, '.precomputed-examples.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual(sample)
    await expect(readPrecomputedExamplesCache(outDir)).resolves.toEqual(sample)
  })
})
