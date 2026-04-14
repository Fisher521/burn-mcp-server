// Burn MCP — HTTP transport entry (Web Standard fetch API)
//
// Works on Vercel Edge / Node runtime, Cloudflare Workers, Deno, Bun.
// Users connect by adding ONE URL to Claude/Cursor/Windsurf MCP settings instead of installing npx.
//
// Auth: each request carries `Authorization: Bearer <BURN_MCP_TOKEN>` header.
// Stateless: fresh Supabase client per request (short in-memory session cache for performance).

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createClient } from '@supabase/supabase-js'
import { getOrExchangeSession, applySession } from './lib/auth.js'
import { createBurnServer } from './setup.js'

const SUPABASE_URL = process.env.BURN_SUPABASE_URL || 'https://juqtxylquemiuvvmgbej.supabase.co'
const SUPABASE_ANON_KEY = process.env.BURN_SUPABASE_ANON_KEY || 'sb_publishable_reVgmmCC6ndIo6jFRMM2LQ_wujj5FrO'

/** Main handler — turn an incoming HTTP Request into a JSON-RPC MCP Response. */
export async function handleMcpRequest(req: Request): Promise<Response> {
  // --- Auth: require Bearer token ---
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()

  if (!token) {
    return new Response(JSON.stringify({
      error: 'Missing Authorization header',
      hint: 'Add `Authorization: Bearer <BURN_MCP_TOKEN>` header. Get your token at https://burn451.cloud → Settings → MCP Server.',
    }), { status: 401, headers: { 'content-type': 'application/json' } })
  }

  // --- Exchange token → Supabase session (cached in memory 5 min per token) ---
  let session
  try {
    session = await getOrExchangeSession(token)
  } catch (e: any) {
    return new Response(JSON.stringify({
      error: 'Invalid or expired Burn MCP token',
      detail: String(e?.message || e),
    }), { status: 401, headers: { 'content-type': 'application/json' } })
  }

  // --- Build per-request Supabase client + Burn server ---
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await applySession(supabase, session)

  const server = createBurnServer(supabase, { rateLimitPerMin: 60 })

  // --- Streamable HTTP transport (stateless mode — no session reuse across requests) ---
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode — MCP SDK treats each request as a new conversation
    enableJsonResponse: true,
  })

  await server.connect(transport)
  return transport.handleRequest(req)
}

// ---------- Node.js standalone server (for `npm run dev:http`) ----------

if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = Number(process.env.PORT) || 3001
  const { createServer } = await import('node:http')

  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      // Convert Node IncomingMessage → Web Request
      const url = new URL(nodeReq.url || '/', `http://${nodeReq.headers.host || 'localhost'}`)
      const headers = new Headers()
      for (const [k, v] of Object.entries(nodeReq.headers)) {
        if (typeof v === 'string') headers.set(k, v)
      }
      const body = ['GET', 'HEAD'].includes(nodeReq.method || 'GET')
        ? null
        : await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = []
            nodeReq.on('data', c => chunks.push(c))
            nodeReq.on('end', () => resolve(Buffer.concat(chunks)))
            nodeReq.on('error', reject)
          })

      const webReq = new Request(url, {
        method: nodeReq.method,
        headers,
        body: body && body.length > 0 ? body : null,
      })

      const webRes = await handleMcpRequest(webReq)

      nodeRes.statusCode = webRes.status
      webRes.headers.forEach((v, k) => nodeRes.setHeader(k, v))
      if (webRes.body) {
        const reader = webRes.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          nodeRes.write(value)
        }
      }
      nodeRes.end()
    } catch (e: any) {
      nodeRes.statusCode = 500
      nodeRes.setHeader('content-type', 'application/json')
      nodeRes.end(JSON.stringify({ error: 'Internal error', detail: String(e?.message || e) }))
    }
  })

  server.listen(PORT, () => {
    console.log(`Burn MCP HTTP server listening on http://localhost:${PORT}`)
    console.log(`Test: curl -H "Authorization: Bearer <YOUR_TOKEN>" -X POST http://localhost:${PORT} -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`)
  })
}
