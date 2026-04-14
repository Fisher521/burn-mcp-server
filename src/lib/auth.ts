// Burn MCP auth — Edge/runtime-safe (no node: imports here)
//
// stdio-only session cache (fs-based) is in ./auth-stdio.ts — only imported by src/index.ts.
// HTTP mode uses in-memory TTL cache declared here (safe in Edge).

import { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_EXCHANGE_URL = 'https://api.burn451.cloud/api/mcp-exchange'

export interface Session {
  access_token: string
  refresh_token: string
}

/** Exchange a long-lived MCP token for a Supabase session (fresh from API). */
export async function exchangeToken(
  mcpToken: string,
  exchangeUrl: string = process.env.BURN_MCP_EXCHANGE_URL || DEFAULT_EXCHANGE_URL,
): Promise<Session> {
  const resp = await fetch(exchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: mcpToken }),
  })
  if (!resp.ok) {
    let detail = ''
    try { detail = JSON.stringify(await resp.json()) } catch {}
    throw new Error(`Token exchange failed (${resp.status}): ${detail}`)
  }
  const data = await resp.json() as any
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Token exchange succeeded but returned no session tokens')
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token }
}

/** Apply a session to a supabase client, with optional auto-cache on token refresh (stdio mode only). */
export async function applySession(
  supabase: SupabaseClient,
  session: Session,
  onRefresh?: (s: Session) => void,
): Promise<void> {
  const { error } = await supabase.auth.setSession(session)
  if (error) throw new Error(`Failed to set session: ${error.message}`)
  if (onRefresh) {
    supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.access_token && s?.refresh_token) {
        onRefresh({ access_token: s.access_token, refresh_token: s.refresh_token })
      }
    })
  }
}

// ---------------------------------------------------------------------------
// HTTP mode: per-token in-memory session cache (TTL-based, safe in Edge)
// ---------------------------------------------------------------------------

interface CacheEntry { session: Session; expiresAt: number }
const httpSessionCache = new Map<string, CacheEntry>()
const HTTP_CACHE_TTL_MS = 5 * 60_000  // 5 min

/** Get or refresh a session for an HTTP request. */
export async function getOrExchangeSession(mcpToken: string): Promise<Session> {
  const now = Date.now()
  const cached = httpSessionCache.get(mcpToken)
  if (cached && cached.expiresAt > now) return cached.session

  const session = await exchangeToken(mcpToken)
  httpSessionCache.set(mcpToken, { session, expiresAt: now + HTTP_CACHE_TTL_MS })
  return session
}
