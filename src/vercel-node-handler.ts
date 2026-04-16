// Vercel Node runtime handler — uses StreamableHTTPServerTransport (non-Web variant).
// Pre-bundled by esbuild into api/mcp.js (Vercel detects .js as Node function).

import type { IncomingMessage, ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createClient } from '@supabase/supabase-js'
import { getOrExchangeSession } from './lib/auth.js'
import { createBurnServer } from './setup.js'

const SUPABASE_URL = process.env.BURN_SUPABASE_URL || 'https://juqtxylquemiuvvmgbej.supabase.co'
const SUPABASE_ANON_KEY = process.env.BURN_SUPABASE_ANON_KEY || 'sb_publishable_reVgmmCC6ndIo6jFRMM2LQ_wujj5FrO'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // --- Auth ---
    const authHeader = (req.headers.authorization || req.headers.Authorization || '') as string
    const m = authHeader.match(/^Bearer\s+(.+)$/i)
    const token = m?.[1]?.trim()

    if (!token) {
      res.statusCode = 401
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        error: 'Missing Authorization header',
        hint: 'Add `Authorization: Bearer <BURN_MCP_TOKEN>` — get yours at https://burn451.cloud → Settings → MCP Server.',
      }))
      return
    }

    // --- Exchange token → Supabase session (in-memory cache per token) ---
    let session
    try {
      session = await getOrExchangeSession(token)
    } catch (e: any) {
      res.statusCode = 401
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid or expired Burn MCP token', detail: String(e?.message || e) }))
      return
    }

    // --- Per-request Supabase client with JWT in headers ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    })

    const server = createBurnServer(supabase, { rateLimitPerMin: 60 })

    // --- Stateless transport, JSON response mode ---
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    await server.connect(transport)

    // Read body — Vercel Node already parses JSON for us at req.body, but let's be safe
    let parsedBody: unknown
    if ((req as any).body !== undefined) {
      parsedBody = (req as any).body
    } else {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8')
      try { parsedBody = raw ? JSON.parse(raw) : undefined } catch { parsedBody = undefined }
    }

    await transport.handleRequest(req as any, res, parsedBody)
  } catch (e: any) {
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'Handler threw', message: String(e?.message || e), stack: String(e?.stack || '').slice(0, 2000) }))
    }
  }
}
