// Burn MCP auth — token exchange + optional session caching
//
// Two transport modes:
//   - stdio (single-user CLI):   uses local session cache file (~/.burn/mcp-session.json)
//   - http  (multi-user server): no cache, fresh exchange per request (or short in-memory TTL)

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

/** Apply a session to a supabase client, with auto-cache on token refresh (stdio mode only). */
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
// stdio-only: local session cache so we don't re-exchange on every restart
// ---------------------------------------------------------------------------

import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CACHE_DIR = join(homedir(), '.burn')
const CACHE_FILE = join(CACHE_DIR, 'mcp-session.json')

export function loadCachedSession(): Session | null {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    if (data.access_token && data.refresh_token) return data
  } catch { /* no cache or invalid */ }
  return null
}

export function saveCachedSession(session: Session): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(session), { mode: 0o600 })
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// HTTP mode: per-token in-memory session cache (TTL-based, no disk)
// ---------------------------------------------------------------------------

interface CacheEntry { session: Session; expiresAt: number }
const httpSessionCache = new Map<string, CacheEntry>()
const HTTP_CACHE_TTL_MS = 5 * 60_000  // 5 min

/** Get or refresh a session for an HTTP request. Caches by token hash for HTTP_CACHE_TTL_MS. */
export async function getOrExchangeSession(mcpToken: string): Promise<Session> {
  const now = Date.now()
  const cached = httpSessionCache.get(mcpToken)
  if (cached && cached.expiresAt > now) return cached.session

  const session = await exchangeToken(mcpToken)
  httpSessionCache.set(mcpToken, { session, expiresAt: now + HTTP_CACHE_TTL_MS })
  return session
}
