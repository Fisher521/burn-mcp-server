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

  // --- Build per-request Supabase client with JWT in headers (faster than setSession, Edge-safe) ---
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  })

  const server = createBurnServer(supabase, { rateLimitPerMin: 60 })

  // --- Streamable HTTP transport (stateless mode — no session reuse across requests) ---
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode — MCP SDK treats each request as a new conversation
    enableJsonResponse: true,
  })

  await server.connect(transport)
  return transport.handleRequest(req)
}

// Standalone Node dev server is in src/http-dev.ts (npm run dev:http)
