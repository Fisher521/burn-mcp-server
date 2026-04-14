#!/usr/bin/env node
// Burn MCP — stdio entry (for Claude Desktop / Cursor / Windsurf local install)
// Usage: npx burn-mcp-server  (BURN_MCP_TOKEN env required)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { exchangeToken, applySession } from './lib/auth.js'
import { loadCachedSession, saveCachedSession } from './lib/auth-stdio.js'
import { createBurnServer } from './setup.js'

const SUPABASE_URL = process.env.BURN_SUPABASE_URL || 'https://juqtxylquemiuvvmgbej.supabase.co'
const SUPABASE_ANON_KEY = process.env.BURN_SUPABASE_ANON_KEY || 'sb_publishable_reVgmmCC6ndIo6jFRMM2LQ_wujj5FrO'

const MCP_TOKEN = process.env.BURN_MCP_TOKEN
const LEGACY_JWT = process.env.BURN_SUPABASE_TOKEN

if (!MCP_TOKEN && !LEGACY_JWT) {
  console.error('Error: BURN_MCP_TOKEN environment variable is required.')
  console.error('Get your token from: Burn App → Settings → MCP Server → Generate Token')
  process.exit(1)
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
    ...(LEGACY_JWT ? { global: { headers: { Authorization: `Bearer ${LEGACY_JWT}` } } } : {}),
  })

  if (!LEGACY_JWT && MCP_TOKEN) {
    const cached = loadCachedSession()
    if (cached) {
      try {
        await applySession(supabase, cached, s => saveCachedSession(s))
        console.error('Burn MCP: restored session from cache')
      } catch {
        console.error('Burn MCP: cached session expired, re-exchanging...')
        const fresh = await exchangeToken(MCP_TOKEN)
        await applySession(supabase, fresh, s => saveCachedSession(s))
        saveCachedSession(fresh)
        console.error('Burn MCP: session exchanged and cached')
      }
    } else {
      const fresh = await exchangeToken(MCP_TOKEN)
      await applySession(supabase, fresh, s => saveCachedSession(s))
      saveCachedSession(fresh)
      console.error('Burn MCP: session exchanged and cached')
    }
  }

  const server = createBurnServer(supabase)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Burn MCP Server running on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err)
  process.exit(1)
})
