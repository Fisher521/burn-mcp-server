// Vercel Edge handler — pre-bundled by esbuild into api/mcp.mjs

import { handleMcpRequest } from './http.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handleMcpRequest(req)
  } catch (e: any) {
    return new Response(JSON.stringify({
      error: 'Handler threw',
      message: String(e?.message || e),
      stack: String(e?.stack || '').slice(0, 2000),
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
