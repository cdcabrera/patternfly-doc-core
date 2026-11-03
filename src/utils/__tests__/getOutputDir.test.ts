/**
 * @jest-environment node
 */
import { mkdtemp, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

describe('getOutputDir', () => {
  const originalDocsRoot = process.env.PF_DOCS_ROOT

  afterEach(() => {
    if (originalDocsRoot === undefined) {
      delete process.env.PF_DOCS_ROOT
    } else {
      process.env.PF_DOCS_ROOT = originalDocsRoot
    }
  })

  it('resolves outputDir from PF_DOCS_ROOT instead of process.cwd()', async () => {
    const siteRoot = await mkdtemp(join(tmpdir(), 'pf-docs-site-'))
    const otherCwd = await mkdtemp(join(tmpdir(), 'pf-docs-other-'))

    await writeFile(
      join(siteRoot, 'pf-docs.config.mjs'),
      "export const config = { outputDir: 'dist', content: [] }\n",
    )

    process.env.PF_DOCS_ROOT = siteRoot
    const previousCwd = process.cwd()
    process.chdir(otherCwd)

    try {
      const { getOutputDir } = await import('../getOutputDir')
      await expect(getOutputDir()).resolves.toBe(join(siteRoot, 'dist'))
    } finally {
      process.chdir(previousCwd)
    }
  })
})
