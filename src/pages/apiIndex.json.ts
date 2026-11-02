import type { APIRoute } from 'astro'
import { getApiIndex } from '../utils/apiIndex/get'
import { generateAndWriteApiIndex } from '../utils/apiIndex/generate'

// Prerender at build time so this doesn't run in the Cloudflare Worker
export const prerender = true

export const GET: APIRoute = async () => {
  try {
    let index
    try {
      index = await getApiIndex()
    } catch {
      index = await generateAndWriteApiIndex()
    }

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
