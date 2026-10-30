import type { AstroIntegration, ViteDevServer } from 'astro'
import type { Plugin } from 'vite'

type ViteWithSSR = ViteDevServer & {
  ssrLoadModule?: (id: string) => Promise<Record<string, unknown>>
}

export function apiIndexPregenerateIntegration(): AstroIntegration {
  let viteForBuild: ViteWithSSR | undefined
  let pregenerateDone = false

  async function pregenerateApiIndex(logger: {
    info: (m: string) => void
    warn: (m: string) => void
  }) {
    if (pregenerateDone) {
      return
    }

    const vite = viteForBuild
    if (!vite?.ssrLoadModule) {
      logger.warn(
        '[patternfly-api-index-pregenerate] vite.ssrLoadModule unavailable; prerender-time generation will run',
      )
      return
    }

    const mod = (await vite.ssrLoadModule(
      '/src/utils/apiIndex/generate.ts',
    )) as typeof import('../utils/apiIndex/generate')

    await mod.generateAndPersistApiIndex()
    pregenerateDone = true
    logger.info('[patternfly-api-index-pregenerate] apiIndex.json written before prerender')
  }

  return {
    name: 'patternfly-api-index-pregenerate',
    hooks: {
      'astro:config:done': ({ vite }) => {
        viteForBuild = vite as ViteWithSSR
      },
      'astro:build:setup': ({ vite, updateConfig, logger }) => {
        viteForBuild = vite as ViteWithSSR
        const pregeneratePlugin: Plugin = {
          name: 'patternfly-api-index-pregenerate-vite',
          enforce: 'pre',
          async buildStart() {
            await pregenerateApiIndex(logger)
          },
        }
        updateConfig({
          vite: {
            plugins: [pregeneratePlugin],
          },
        })
      },
      'astro:build:start': async ({ logger }) => {
        await pregenerateApiIndex(logger)
      },
    },
  }
}
