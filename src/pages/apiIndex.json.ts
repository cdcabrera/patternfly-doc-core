import type { APIRoute } from 'astro'
import type { ApiIndex } from '../utils/apiIndex/generate'
import { API_INDEX_COMPLETE_MARKER, getApiIndex } from '../utils/apiIndex/get'
import { join } from 'path'
import { access } from 'fs/promises'
import { getOutputDir } from '../utils/getOutputDir'

// Prerender at build time so this doesn't run in the Cloudflare Worker
export const prerender = true

/** Audit artifact route: read the index written by getStaticPaths / lock, never rescan collections. */
async function readPrerenderedApiIndexFromDisk(): Promise<ApiIndex> {
  for (let attempt = 0; attempt < 600; attempt++) {
    try {
      const outputDir = await getOutputDir()
      const markerPath = join(outputDir, API_INDEX_COMPLETE_MARKER)
      await access(markerPath)
      const index = await getApiIndex()
      if (index.versions.length > 0 && Object.keys(index.examples).length > 0) {
        return index
      }
    } catch {
      // index not written yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Timed out waiting for apiIndex.json on disk before prerender')
}

export const GET: APIRoute = async () => {
  try {
    const index = await readPrerenderedApiIndexFromDisk()
    return new Response(JSON.stringify(index), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to load API index', details: error }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
}
