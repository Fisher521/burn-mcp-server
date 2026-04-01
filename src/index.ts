#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.BURN_SUPABASE_URL || 'https://juqtxylquemiuvvmgbej.supabase.co'
const SUPABASE_ANON_KEY = process.env.BURN_SUPABASE_ANON_KEY || 'sb_publishable_reVgmmCC6ndIo6jFRMM2LQ_wujj5FrO'

// Support both old JWT token (BURN_SUPABASE_TOKEN) and new long-lived MCP token (BURN_MCP_TOKEN)
const MCP_TOKEN = process.env.BURN_MCP_TOKEN
const LEGACY_JWT = process.env.BURN_SUPABASE_TOKEN
const EXCHANGE_URL = process.env.BURN_MCP_EXCHANGE_URL || 'https://api.burn451.cloud/api/mcp-exchange'

if (!MCP_TOKEN && !LEGACY_JWT) {
  console.error('Error: BURN_MCP_TOKEN environment variable is required.')
  console.error('Get your token from: Burn App → Settings → MCP Server → Generate Token')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Supabase client — bootstrapped with anon key, session set after auth below
// ---------------------------------------------------------------------------

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
  ...(LEGACY_JWT ? { global: { headers: { Authorization: `Bearer ${LEGACY_JWT}` } } } : {}),
})

// ---------------------------------------------------------------------------
// Auth: exchange MCP token for a real Supabase session (auto-refreshes)
// Caches session locally so exchange is only needed on first run or token expiry
// ---------------------------------------------------------------------------

import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SESSION_CACHE_DIR = join(homedir(), '.burn')
const SESSION_CACHE_FILE = join(SESSION_CACHE_DIR, 'mcp-session.json')

function loadCachedSession(): { access_token: string; refresh_token: string } | null {
  try {
    const raw = readFileSync(SESSION_CACHE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    if (data.access_token && data.refresh_token) return data
  } catch { /* no cache or invalid */ }
  return null
}

function saveCachedSession(access_token: string, refresh_token: string): void {
  try {
    mkdirSync(SESSION_CACHE_DIR, { recursive: true })
    writeFileSync(SESSION_CACHE_FILE, JSON.stringify({ access_token, refresh_token }), { mode: 0o600 })
  } catch { /* non-fatal — next startup will re-exchange */ }
}

async function initAuth(): Promise<void> {
  if (LEGACY_JWT) return // legacy mode: JWT already set in headers above

  // Step 1: Try cached session (avoids network call on every restart)
  const cached = loadCachedSession()
  if (cached) {
    const { error } = await supabase.auth.setSession(cached)
    if (!error) {
      // Listen for token refresh so we keep the cache fresh
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token && session?.refresh_token) {
          saveCachedSession(session.access_token, session.refresh_token)
        }
      })
      console.error('Burn MCP: restored session from cache (no network needed)')
      return
    }
    console.error('Burn MCP: cached session expired, re-exchanging...')
  }

  // Step 2: Exchange MCP token for a fresh Supabase session via Vercel API
  try {
    const resp = await fetch(EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: MCP_TOKEN }),
    })

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as any
      console.error(`Error: Token exchange failed (${resp.status}): ${body.error || 'Unknown'}`)
      console.error('Tokens expire after 30 days. Generate a new one in Burn App → Settings → MCP Server.')
      process.exit(1)
    }

    const { access_token, refresh_token } = await resp.json() as any

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    if (sessionError) {
      console.error('Error: Failed to set session.', sessionError.message)
      process.exit(1)
    }

    // Cache for next startup + listen for refresh
    saveCachedSession(access_token, refresh_token)
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session?.refresh_token) {
        saveCachedSession(session.access_token, session.refresh_token)
      }
    })
    console.error('Burn MCP: session exchanged and cached')
  } catch (err: any) {
    console.error('Error: Could not reach token exchange endpoint.', err.message)
    console.error(`URL: ${EXCHANGE_URL}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Rate limiter — simple sliding window (per MCP session, in-memory)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_CALLS = 30     // max tool calls per window

const rateLimitLog: number[] = []

function checkRateLimit(): string | null {
  const now = Date.now()
  // Remove entries outside the window
  while (rateLimitLog.length > 0 && rateLimitLog[0] < now - RATE_LIMIT_WINDOW_MS) {
    rateLimitLog.shift()
  }
  if (rateLimitLog.length >= RATE_LIMIT_MAX_CALLS) {
    const retryAfter = Math.ceil((rateLimitLog[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)
    return `Rate limit exceeded (${RATE_LIMIT_MAX_CALLS} calls/min). Retry after ${retryAfter}s.`
  }
  rateLimitLog.push(now)
  return null
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'burn-mcp-server',
  version: '2.0.0',
})

// ---------------------------------------------------------------------------
// Helper: standard text result
// ---------------------------------------------------------------------------

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

// ---------------------------------------------------------------------------
// Helper: verify bookmark exists and has expected status
// ---------------------------------------------------------------------------

async function verifyBookmark(
  id: string,
  expectedStatus?: string | string[]
): Promise<{ data: any; error: string | null }> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return { data: null, error: error.code === 'PGRST116' ? 'Bookmark not found' : error.message }

  if (expectedStatus) {
    const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]
    if (!allowed.includes(data.status)) {
      const statusLabels: Record<string, string> = { active: 'Flame', read: 'Spark', absorbed: 'Vault', ash: 'Ash' }
      return { data, error: `Bookmark is in ${statusLabels[data.status] || data.status} (expected ${allowed.map(s => statusLabels[s] || s).join(' or ')})` }
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Helper: merge fields into content_metadata JSONB without overwriting
// ---------------------------------------------------------------------------

async function mergeContentMetadata(
  bookmarkId: string,
  fields: Record<string, unknown>,
  extraColumns?: Record<string, unknown>
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('content_metadata')
    .eq('id', bookmarkId)
    .single()

  if (error) return { error: error.message }

  const existing = (data.content_metadata || {}) as Record<string, unknown>
  // Only merge non-undefined fields
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) cleaned[k] = v
  }
  const merged = { ...existing, ...cleaned }

  const { error: updateError } = await supabase
    .from('bookmarks')
    .update({ content_metadata: merged, ...extraColumns })
    .eq('id', bookmarkId)

  return { error: updateError?.message || null }
}

// ---------------------------------------------------------------------------
// Helper: extract fields from content_metadata JSONB
// ---------------------------------------------------------------------------

function meta(row: any): any {
  const m = row.content_metadata || {}
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    author: m.author || row.author || null,
    platform: row.platform,
    status: row.status,
    tags: m.tags || [],
    thumbnail: m.thumbnail || null,
    vaultCategory: m.vault_category || null,
    vaultedAt: m.vaulted_at || null,
    aiPositioning: m.ai_positioning || null,
    aiDensity: m.ai_density || null,
    aiMinutes: m.ai_minutes || null,
    aiTakeaway: m.ai_takeaway || [],
    aiStrategyReason: m.ai_strategy_reason || null,
    aiHowToRead: m.ai_how_to_read || null,
    aiOverlap: m.ai_overlap || null,
    aiVerdict: m.ai_verdict || null,
    aiSummary: m.ai_summary || null,
    sparkInsight: m.spark_insight || null,
    extractedContent: m.extracted_content || null,
    externalURL: m.external_url || null,
    aiRelevance: m.ai_relevance || null,
    aiNovelty: m.ai_novelty || null,
    createdAt: row.created_at,
    countdownExpiresAt: row.countdown_expires_at,
    readAt: row.read_at,
  }
}

/** Compact summary for list views (no extracted content) */
function metaSummary(row: any): any {
  const m = row.content_metadata || {}
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    author: m.author || null,
    platform: row.platform,
    tags: m.tags || [],
    vaultCategory: m.vault_category || null,
    vaultedAt: m.vaulted_at || null,
    aiPositioning: m.ai_positioning || null,
    aiTakeaway: m.ai_takeaway || [],
  }
}

/** Flame-specific summary with countdown and AI triage fields */
function flameSummary(row: any): any {
  const m = row.content_metadata || {}
  const expiresAt = row.countdown_expires_at ? new Date(row.countdown_expires_at) : null
  const now = new Date()
  const remainingMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0
  const remainingHours = Math.max(0, Math.round(remainingMs / 3600000 * 10) / 10)

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    author: m.author || null,
    platform: row.platform,
    tags: m.tags || [],
    createdAt: row.created_at,
    expiresAt: row.countdown_expires_at,
    remainingHours,
    isBurning: remainingHours <= 6,
    isCritical: remainingHours <= 1,
    aiPositioning: m.ai_positioning || null,
    aiDensity: m.ai_density || null,
    aiMinutes: m.ai_minutes || null,
    aiTakeaway: m.ai_takeaway || [],
    aiStrategy: m.ai_strategy || null,
    aiStrategyReason: m.ai_strategy_reason || null,
    aiHowToRead: m.ai_how_to_read || null,
    aiRelevance: m.ai_relevance || null,
    aiNovelty: m.ai_novelty || null,
    aiOverlap: m.ai_overlap || null,
    aiHook: m.ai_hook || null,
    aiAbout: m.ai_about || [],
  }
}

// ---------------------------------------------------------------------------
// Tool handlers (all wrapped with rate limiting)
// ---------------------------------------------------------------------------

/** Wrap a handler with rate limiting */
function rateLimited<T>(handler: (args: T) => Promise<{ content: { type: 'text'; text: string }[] }>) {
  return async (args: T) => {
    const err = checkRateLimit()
    if (err) return textResult(err)
    return handler(args)
  }
}

async function handleSearchVault(args: { query: string; limit?: number }) {
  const { query, limit } = args
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('status', 'absorbed')
    .ilike('title', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit || 10)

  if (error) return textResult(`Error: ${error.message}`)

  // Also search in content_metadata tags and takeaway
  let results = (data || []).map(metaSummary)

  // If title search returned few results, also search by tag
  if (results.length < (limit || 10)) {
    const { data: tagData } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('status', 'absorbed')
      .order('created_at', { ascending: false })
      .limit(50)

    if (tagData) {
      const existingIds = new Set(results.map((r: any) => r.id))
      const tagMatches = tagData
        .filter((row: any) => {
          if (existingIds.has(row.id)) return false
          const m = row.content_metadata || {}
          const tags = (m.tags || []) as string[]
          const takeaway = (m.ai_takeaway || []) as string[]
          const positioning = m.ai_positioning || ''
          const allText = [...tags, ...takeaway, positioning].join(' ').toLowerCase()
          return allText.includes(query.toLowerCase())
        })
        .map(metaSummary)

      results = [...results, ...tagMatches].slice(0, limit || 10)
    }
  }

  return textResult(JSON.stringify(results, null, 2))
}

async function handleGetBookmark(args: { id: string }) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('id', args.id)
    .single()

  if (error) return textResult(`Error: ${error.message}`)
  return textResult(JSON.stringify(meta(data), null, 2))
}

async function handleListCategories() {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('content_metadata')
    .eq('status', 'absorbed')

  if (error) return textResult(`Error: ${error.message}`)

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    const cat = (row.content_metadata as any)?.vault_category || 'Uncategorized'
    counts[cat] = (counts[cat] || 0) + 1
  }

  const categories = Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return textResult(JSON.stringify(categories, null, 2))
}

async function handleGetCollections() {
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, bookmark_ids, ai_overview')

  if (error) return textResult(`Error: ${error.message}`)

  const collections = (data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    articleCount: Array.isArray(c.bookmark_ids) ? c.bookmark_ids.length : 0,
    overview: c.ai_overview?.theme || null,
  }))

  return textResult(JSON.stringify(collections, null, 2))
}

async function handleGetCollectionOverview(args: { name: string }) {
  const { data: collection, error } = await supabase
    .from('collections')
    .select('*')
    .eq('name', args.name)
    .single()

  if (error) {
    return textResult(
      error.code === 'PGRST116'
        ? `No collection found with name "${args.name}".`
        : `Error: ${error.message}`
    )
  }

  let bookmarks: any[] = []
  if (Array.isArray(collection.bookmark_ids) && collection.bookmark_ids.length > 0) {
    const { data: bData, error: bError } = await supabase
      .from('bookmarks')
      .select('*')
      .in('id', collection.bookmark_ids)

    if (!bError && bData) {
      bookmarks = bData.map(metaSummary)
    }
  }

  return textResult(JSON.stringify({
    id: collection.id,
    name: collection.name,
    articleCount: Array.isArray(collection.bookmark_ids) ? collection.bookmark_ids.length : 0,
    aiOverview: collection.ai_overview,
    bookmarks,
  }, null, 2))
}

async function handleGetArticleContent(args: { id: string }) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('id', args.id)
    .single()

  if (error) return textResult(`Error: ${error.message}`)
  return textResult(JSON.stringify(meta(data), null, 2))
}

// ---------------------------------------------------------------------------
// Vercel API base URL for content fetching
// ---------------------------------------------------------------------------

const API_BASE = process.env.BURN_API_URL || 'https://api.burn451.cloud'
const API_KEY = process.env.BURN_API_KEY || 'burn451-2026-secret-key'

/** Detect platform from URL */
function detectPlatform(url: string): string {
  if (/x\.com|twitter\.com/i.test(url)) return 'x'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  if (/reddit\.com|redd\.it/i.test(url)) return 'reddit'
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili'
  if (/open\.spotify\.com/i.test(url)) return 'spotify'
  if (/mp\.weixin\.qq\.com/i.test(url)) return 'wechat'
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'xhs'
  return 'web'
}

/** Fetch content via Vercel API proxy (bypasses GFW for X.com, etc.) */
async function fetchViaAPI(url: string, platform: string): Promise<{ title?: string; author?: string; content?: string; error?: string }> {
  try {
    let endpoint: string
    let params: string

    switch (platform) {
      case 'x':
        endpoint = `${API_BASE}/api/parse-x`
        params = `url=${encodeURIComponent(url)}`
        break
      case 'reddit':
        endpoint = `${API_BASE}/api/parse-reddit`
        params = `url=${encodeURIComponent(url)}`
        break
      case 'spotify':
        endpoint = `${API_BASE}/api/parse-meta`
        params = `url=${encodeURIComponent(url)}&_platform=spotify`
        break
      case 'wechat':
      case 'xhs':
        endpoint = `${API_BASE}/api/parse-meta`
        params = `url=${encodeURIComponent(url)}&_platform=${platform}`
        break
      case 'youtube':
        // Try transcript extraction via jina-extract with youtube platform hint
        endpoint = `${API_BASE}/api/jina-extract`
        params = `url=${encodeURIComponent(url)}&_platform=youtube`
        break
      default:
        endpoint = `${API_BASE}/api/jina-extract`
        params = `url=${encodeURIComponent(url)}`
        break
    }

    const resp = await fetch(`${endpoint}?${params}`, {
      headers: {
        'x-api-key': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) {
      return { error: `API returned ${resp.status}` }
    }

    const data = await resp.json() as any

    // Normalize response across different API endpoints
    if (platform === 'x') {
      const text = data.text || data.article_text || ''
      const quoteText = data.quote ? `\n\n[Quote from @${data.quote.handle}]: ${data.quote.text}` : ''
      return {
        title: data.text?.slice(0, 100) || 'Tweet',
        author: data.author ? `@${data.handle || data.author}` : undefined,
        content: text + quoteText,
      }
    }

    if (platform === 'spotify') {
      return {
        title: data.title,
        author: data.author,
        content: data.extracted_content || data.description || null,
      }
    }

    if (platform === 'wechat') {
      // WeChat parse-meta returns extracted_content from js_content div
      return {
        title: data.title,
        author: data.author,
        content: data.extracted_content || data.content || null,
      }
    }

    return {
      title: data.title,
      author: data.author,
      content: data.content || data.extracted_content || data.text || data.transcript || null,
    }
  } catch (err: any) {
    return { error: err.message || 'Fetch failed' }
  }
}

async function handleFetchContent(args: { url: string }) {
  const { url } = args
  const platform = detectPlatform(url)

  // Step 1: Check if we already have content in Supabase
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('url', url)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const m = existing.content_metadata || {}
    if (m.extracted_content && m.extracted_content.length > 50) {
      return textResult(JSON.stringify({
        source: 'cache',
        url,
        platform,
        title: existing.title,
        author: m.author,
        content: m.extracted_content,
        aiPositioning: m.ai_positioning,
        aiTakeaway: m.ai_takeaway,
        tags: m.tags,
      }, null, 2))
    }
  }

  // Step 2: Fetch fresh content via Vercel API
  const result = await fetchViaAPI(url, platform)

  if (result.error) {
    return textResult(JSON.stringify({
      source: 'error',
      url,
      platform,
      error: result.error,
      hint: platform === 'x' ? 'X.com content is fetched via Vercel Edge proxy to bypass GFW' : undefined,
    }, null, 2))
  }

  return textResult(JSON.stringify({
    source: 'live',
    url,
    platform,
    title: result.title,
    author: result.author,
    content: result.content,
  }, null, 2))
}

async function handleListSparks(args: { limit?: number }) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('status', 'read')
    .order('created_at', { ascending: false })
    .limit(args.limit || 20)

  if (error) return textResult(`Error: ${error.message}`)

  const results = (data || []).map((row: any) => {
    const s = metaSummary(row)
    const m = row.content_metadata || {}
    return {
      ...s,
      sparkInsight: m.spark_insight || null,
      sparkExpiresAt: m.spark_expires_at || null,
    }
  })

  return textResult(JSON.stringify(results, null, 2))
}

async function handleSearchSparks(args: { query: string; limit?: number }) {
  const { query, limit } = args
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('status', 'read')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return textResult(`Error: ${error.message}`)

  const results = (data || [])
    .filter((row: any) => {
      const m = row.content_metadata || {}
      const searchable = [
        row.title || '',
        ...(m.tags || []),
        ...(m.ai_takeaway || []),
        m.ai_positioning || '',
        m.spark_insight || '',
      ].join(' ').toLowerCase()
      return searchable.includes(query.toLowerCase())
    })
    .slice(0, limit || 10)
    .map((row: any) => {
      const s = metaSummary(row)
      const m = row.content_metadata || {}
      return {
        ...s,
        sparkInsight: m.spark_insight || null,
        sparkExpiresAt: m.spark_expires_at || null,
      }
    })

  return textResult(JSON.stringify(results, null, 2))
}

async function handleListFlame(args: { limit?: number }) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(args.limit || 20)

  if (error) return textResult(`Error: ${error.message}`)

  // Filter out already expired ones (should be ash but not yet processed)
  const now = new Date()
  const results = (data || [])
    .filter((row: any) => {
      if (!row.countdown_expires_at) return true
      return new Date(row.countdown_expires_at).getTime() > now.getTime()
    })
    .map(flameSummary)

  return textResult(JSON.stringify(results, null, 2))
}

async function handleGetFlameDetail(args: { id: string }) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('id', args.id)
    .eq('status', 'active')
    .single()

  if (error) {
    return textResult(
      error.code === 'PGRST116'
        ? `No active Flame bookmark found with id "${args.id}". It may have already burned to Ash or been moved to Spark/Vault.`
        : `Error: ${error.message}`
    )
  }

  // Return full detail including extracted content
  const m = data.content_metadata || {}
  const expiresAt = data.countdown_expires_at ? new Date(data.countdown_expires_at) : null
  const now = new Date()
  const remainingMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0
  const remainingHours = Math.max(0, Math.round(remainingMs / 3600000 * 10) / 10)

  const result = {
    ...flameSummary(data),
    extractedContent: m.extracted_content || null,
    externalURL: m.external_url || null,
    thumbnail: m.thumbnail || null,
    aiFocus: m.ai_focus || null,
    aiUse: m.ai_use || null,
    aiBuzz: m.ai_buzz || null,
  }

  return textResult(JSON.stringify(result, null, 2))
}

async function handleListVault(args: { limit?: number; category?: string }) {
  let query = supabase
    .from('bookmarks')
    .select('*')
    .eq('status', 'absorbed')
    .order('created_at', { ascending: false })
    .limit(args.limit || 20)

  const { data, error } = await query

  if (error) return textResult(`Error: ${error.message}`)

  let results = (data || []).map(metaSummary)

  // Filter by category if provided
  if (args.category) {
    results = results.filter((r: any) =>
      r.vaultCategory?.toLowerCase() === args.category!.toLowerCase()
    )
  }

  return textResult(JSON.stringify(results, null, 2))
}

// ---------------------------------------------------------------------------
// Layer 1: Status flow handlers (决策层)
// ---------------------------------------------------------------------------

async function handleMoveFlameToSpark(args: { id: string; spark_insight?: string }) {
  const { data, error } = await verifyBookmark(args.id, 'active')
  if (error) return textResult(`Error: ${error}`)

  const sparkExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const metaFields: Record<string, unknown> = { spark_expires_at: sparkExpiresAt }
  if (args.spark_insight) metaFields.spark_insight = args.spark_insight

  const { error: mergeErr } = await mergeContentMetadata(args.id, metaFields, {
    status: 'read',
    read_at: new Date().toISOString(),
  })
  if (mergeErr) return textResult(`Error: ${mergeErr}`)

  return textResult(JSON.stringify({
    success: true,
    id: args.id,
    title: data.title,
    action: 'flame → spark',
    sparkExpiresAt,
  }, null, 2))
}

async function handleMoveFlameToAsh(args: { id: string; reason?: string }) {
  const { data, error } = await verifyBookmark(args.id, 'active')
  if (error) return textResult(`Error: ${error}`)

  const { error: updateErr } = await supabase
    .from('bookmarks')
    .update({ status: 'ash' })
    .eq('id', args.id)

  if (updateErr) return textResult(`Error: ${updateErr.message}`)

  return textResult(JSON.stringify({
    success: true,
    id: args.id,
    title: data.title,
    action: 'flame → ash',
    reason: args.reason || null,
  }, null, 2))
}

async function handleMoveSparkToVault(args: { id: string; vault_category?: string }) {
  const { data, error } = await verifyBookmark(args.id, 'read')
  if (error) return textResult(`Error: ${error}`)

  const metaFields: Record<string, unknown> = { vaulted_at: new Date().toISOString() }
  if (args.vault_category) metaFields.vault_category = args.vault_category

  const { error: mergeErr } = await mergeContentMetadata(args.id, metaFields, {
    status: 'absorbed',
  })
  if (mergeErr) return textResult(`Error: ${mergeErr}`)

  return textResult(JSON.stringify({
    success: true,
    id: args.id,
    title: data.title,
    action: 'spark → vault',
    vaultCategory: args.vault_category || null,
  }, null, 2))
}

async function handleMoveSparkToAsh(args: { id: string }) {
  const { data, error } = await verifyBookmark(args.id, 'read')
  if (error) return textResult(`Error: ${error}`)

  const { error: updateErr } = await supabase
    .from('bookmarks')
    .update({ status: 'ash' })
    .eq('id', args.id)

  if (updateErr) return textResult(`Error: ${updateErr.message}`)

  return textResult(JSON.stringify({
    success: true,
    id: args.id,
    title: data.title,
    action: 'spark → ash',
  }, null, 2))
}

async function handleBatchTriageFlame(args: { decisions: Array<{ id: string; action: 'spark' | 'ash'; spark_insight?: string }> }) {
  const results: Array<{ id: string; action: string; success: boolean; error?: string; title?: string }> = []

  for (const decision of args.decisions) {
    if (decision.action === 'spark') {
      const res = await handleMoveFlameToSpark({ id: decision.id, spark_insight: decision.spark_insight })
      const parsed = JSON.parse(res.content[0].text)
      results.push({ id: decision.id, action: 'flame → spark', success: !!parsed.success, error: parsed.success ? undefined : res.content[0].text, title: parsed.title })
    } else {
      const res = await handleMoveFlameToAsh({ id: decision.id })
      const parsed = JSON.parse(res.content[0].text)
      results.push({ id: decision.id, action: 'flame → ash', success: !!parsed.success, error: parsed.success ? undefined : res.content[0].text, title: parsed.title })
    }
  }

  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return textResult(JSON.stringify({
    summary: `${succeeded} succeeded, ${failed} failed (of ${results.length} total)`,
    results,
  }, null, 2))
}

// ---------------------------------------------------------------------------
// Layer 3: AI analysis writeback handler (分析层)
// ---------------------------------------------------------------------------

async function handleWriteBookmarkAnalysis(args: {
  id: string
  analysis: {
    ai_summary?: string
    ai_strategy?: string
    ai_strategy_reason?: string
    ai_minutes?: number
    ai_takeaway?: string[]
    ai_relevance?: number
    ai_novelty?: number
    tags?: string[]
  }
}) {
  const { data, error } = await verifyBookmark(args.id)
  if (error) return textResult(`Error: ${error}`)

  const { error: mergeErr } = await mergeContentMetadata(args.id, args.analysis)
  if (mergeErr) return textResult(`Error: ${mergeErr}`)

  const fieldsWritten = Object.keys(args.analysis).filter(k => (args.analysis as any)[k] !== undefined)

  return textResult(JSON.stringify({
    success: true,
    id: args.id,
    title: data.title,
    fieldsWritten,
  }, null, 2))
}

// ---------------------------------------------------------------------------
// Layer 2: Collection handlers (组合层)
// ---------------------------------------------------------------------------

async function handleCreateCollection(args: { name: string; bookmark_ids?: string[] }) {
  // Get user ID from an existing bookmark (RLS ensures we only see our own)
  const { data: sample } = await supabase
    .from('bookmarks')
    .select('user_id')
    .limit(1)
    .single()

  if (!sample) return textResult('Error: No bookmarks found — cannot determine user ID')

  const bookmarkIds = args.bookmark_ids || []

  // Verify bookmark_ids exist if provided
  if (bookmarkIds.length > 0) {
    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .in('id', bookmarkIds)

    const existingIds = new Set((existing || []).map((b: any) => b.id))
    const missing = bookmarkIds.filter(id => !existingIds.has(id))
    if (missing.length > 0) {
      return textResult(`Error: Bookmark IDs not found: ${missing.join(', ')}`)
    }
  }

  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id: sample.user_id,
      name: args.name,
      bookmark_ids: bookmarkIds,
      is_overview_stale: true,
    })
    .select()
    .single()

  if (error) return textResult(`Error: ${error.message}`)

  return textResult(JSON.stringify({
    success: true,
    id: data.id,
    name: data.name,
    articleCount: bookmarkIds.length,
  }, null, 2))
}

async function handleAddToCollection(args: { collection_id: string; bookmark_ids: string[] }) {
  const { data: collection, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', args.collection_id)
    .single()

  if (error) {
    return textResult(error.code === 'PGRST116' ? 'Error: Collection not found' : `Error: ${error.message}`)
  }

  // Verify bookmark_ids exist
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .in('id', args.bookmark_ids)

  const existingIds = new Set((existing || []).map((b: any) => b.id))
  const missing = args.bookmark_ids.filter(id => !existingIds.has(id))
  if (missing.length > 0) {
    return textResult(`Error: Bookmark IDs not found: ${missing.join(', ')}`)
  }

  // Union with existing (deduplicate)
  const currentIds = new Set(collection.bookmark_ids || [])
  const newIds = args.bookmark_ids.filter(id => !currentIds.has(id))
  const merged = [...(collection.bookmark_ids || []), ...newIds]

  const { error: updateErr } = await supabase
    .from('collections')
    .update({ bookmark_ids: merged, is_overview_stale: true })
    .eq('id', args.collection_id)

  if (updateErr) return textResult(`Error: ${updateErr.message}`)

  return textResult(JSON.stringify({
    success: true,
    collectionId: args.collection_id,
    name: collection.name,
    added: newIds.length,
    alreadyPresent: args.bookmark_ids.length - newIds.length,
    totalArticles: merged.length,
  }, null, 2))
}

async function handleRemoveFromCollection(args: { collection_id: string; bookmark_ids: string[] }) {
  const { data: collection, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', args.collection_id)
    .single()

  if (error) {
    return textResult(error.code === 'PGRST116' ? 'Error: Collection not found' : `Error: ${error.message}`)
  }

  const removeSet = new Set(args.bookmark_ids)
  const filtered = (collection.bookmark_ids || []).filter((id: string) => !removeSet.has(id))
  const removed = (collection.bookmark_ids || []).length - filtered.length

  const { error: updateErr } = await supabase
    .from('collections')
    .update({ bookmark_ids: filtered, is_overview_stale: true })
    .eq('id', args.collection_id)

  if (updateErr) return textResult(`Error: ${updateErr.message}`)

  return textResult(JSON.stringify({
    success: true,
    collectionId: args.collection_id,
    name: collection.name,
    removed,
    totalArticles: filtered.length,
  }, null, 2))
}

async function handleUpdateCollectionOverview(args: {
  collection_id: string
  overview: {
    theme: string
    synthesis?: string
    patterns?: string[]
    gaps?: string[]
  }
}) {
  const { data: collection, error } = await supabase
    .from('collections')
    .select('id, name')
    .eq('id', args.collection_id)
    .single()

  if (error) {
    return textResult(error.code === 'PGRST116' ? 'Error: Collection not found' : `Error: ${error.message}`)
  }

  const { error: updateErr } = await supabase
    .from('collections')
    .update({ ai_overview: args.overview, is_overview_stale: false })
    .eq('id', args.collection_id)

  if (updateErr) return textResult(`Error: ${updateErr.message}`)

  return textResult(JSON.stringify({
    success: true,
    collectionId: args.collection_id,
    name: collection.name,
    overviewTheme: args.overview.theme,
  }, null, 2))
}

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

// @ts-expect-error — MCP SDK 1.27 TS2589: type instantiation too deep with multiple .tool() calls
server.tool(
  'search_vault',
  'Search your Burn Vault for bookmarks by keyword (searches title, tags, AI takeaway)',
  { query: z.string().describe('Search keyword'), limit: z.number().optional().describe('Max results (default 10)') },
  rateLimited(handleSearchVault)
)

server.tool(
  'list_vault',
  'List bookmarks in your Vault, optionally filtered by category',
  { limit: z.number().optional().describe('Max results (default 20)'), category: z.string().optional().describe('Filter by vault category') },
  rateLimited(handleListVault)
)

server.tool(
  'list_sparks',
  'List your Sparks (bookmarks you have read, with 30-day lifespan). Includes spark insight and expiry date.',
  { limit: z.number().optional().describe('Max results (default 20)') },
  rateLimited(handleListSparks)
)

server.tool(
  'search_sparks',
  'Search your Sparks by keyword (searches title, tags, AI takeaway, spark insight)',
  { query: z.string().describe('Search keyword'), limit: z.number().optional().describe('Max results (default 10)') },
  rateLimited(handleSearchSparks)
)

server.tool(
  'get_bookmark',
  'Get full details of a single bookmark including AI analysis and extracted content',
  { id: z.string().describe('Bookmark UUID') },
  rateLimited(handleGetBookmark)
)

server.tool(
  'get_article_content',
  'Get full article content and AI analysis for a bookmark by ID (same as get_bookmark)',
  { id: z.string().describe('Bookmark UUID') },
  rateLimited(handleGetArticleContent)
)

server.tool(
  'fetch_content',
  'Fetch article/tweet content from a URL. Works with X.com (bypasses GFW via proxy), Reddit, YouTube, Bilibili, WeChat, and any web page. First checks Supabase cache, then fetches live.',
  { url: z.string().describe('The URL to fetch content from') },
  rateLimited(handleFetchContent)
)

server.tool(
  'list_categories',
  'List all Vault categories with article counts',
  {},
  rateLimited(handleListCategories)
)

server.tool(
  'list_flame',
  'List bookmarks in your Flame inbox (24h countdown). Shows AI triage info (strategy, relevance, novelty, hook) and time remaining. Use this to see what needs attention before it burns to Ash.',
  { limit: z.number().optional().describe('Max results (default 20)') },
  rateLimited(handleListFlame)
)

server.tool(
  'get_flame_detail',
  'Get full details of a Flame bookmark including extracted article content, AI analysis, and reading guidance. Use this to deep-read a bookmark before deciding its fate.',
  { id: z.string().describe('Bookmark UUID') },
  rateLimited(handleGetFlameDetail)
)

server.tool(
  'get_collections',
  'List all your Collections with article counts and AI overview themes',
  {},
  rateLimited(handleGetCollections)
)

server.tool(
  'get_collection_overview',
  'Get a Collection by name with its AI overview and linked bookmarks metadata',
  { name: z.string().describe('Collection name') },
  rateLimited(handleGetCollectionOverview)
)

// ---------------------------------------------------------------------------
// Layer 1: Status flow tools (决策层)
// ---------------------------------------------------------------------------

server.tool(
  'move_flame_to_spark',
  'Move a Flame bookmark to Spark (mark as worth reading). Sets 30-day Spark lifespan.',
  {
    id: z.string().describe('Bookmark UUID'),
    spark_insight: z.string().max(500).optional().describe('One-line insight about why this is worth reading'),
  },
  rateLimited(handleMoveFlameToSpark)
)

server.tool(
  'move_flame_to_ash',
  'Burn a Flame bookmark to Ash (not worth keeping).',
  {
    id: z.string().describe('Bookmark UUID'),
    reason: z.string().max(200).optional().describe('Why this was burned'),
  },
  rateLimited(handleMoveFlameToAsh)
)

server.tool(
  'move_spark_to_vault',
  'Promote a Spark bookmark to permanent Vault storage.',
  {
    id: z.string().describe('Bookmark UUID'),
    vault_category: z.string().max(100).optional().describe('Category to file under in the Vault'),
  },
  rateLimited(handleMoveSparkToVault)
)

server.tool(
  'move_spark_to_ash',
  'Burn a Spark bookmark to Ash (not valuable enough to vault).',
  {
    id: z.string().describe('Bookmark UUID'),
  },
  rateLimited(handleMoveSparkToAsh)
)

// @ts-expect-error — MCP SDK TS2589
server.tool(
  'batch_triage_flame',
  'Triage multiple Flame bookmarks at once. Each decision moves a bookmark to Spark or Ash.',
  {
    decisions: z.array(z.object({
      id: z.string().describe('Bookmark UUID'),
      action: z.enum(['spark', 'ash']).describe('spark = keep, ash = burn'),
      spark_insight: z.string().max(500).optional().describe('Insight (only for spark action)'),
    })).min(1).max(20).describe('Array of triage decisions'),
  },
  rateLimited(handleBatchTriageFlame)
)

// ---------------------------------------------------------------------------
// Layer 3: AI analysis writeback tools (分析层)
// ---------------------------------------------------------------------------

// @ts-expect-error — MCP SDK TS2589
server.tool(
  'write_bookmark_analysis',
  'Write AI analysis results into a bookmark. Agent analyzes content with its own LLM, then writes structured results back to Burn. Only provided fields are merged — existing data is preserved.',
  {
    id: z.string().describe('Bookmark UUID'),
    analysis: z.object({
      ai_summary: z.string().max(200).optional().describe('One-line summary'),
      ai_strategy: z.enum(['deep_read', 'skim', 'skip_read', 'reference']).optional().describe('Reading strategy'),
      ai_strategy_reason: z.string().max(200).optional().describe('Why this strategy'),
      ai_minutes: z.number().int().min(1).max(999).optional().describe('Estimated reading minutes'),
      ai_takeaway: z.array(z.string().max(200)).max(5).optional().describe('Key takeaways'),
      ai_relevance: z.number().int().min(0).max(100).optional().describe('Relevance score 0-100'),
      ai_novelty: z.number().int().min(0).max(100).optional().describe('Novelty score 0-100'),
      tags: z.array(z.string().max(50)).max(10).optional().describe('Topic tags'),
    }).describe('Analysis fields to write'),
  },
  rateLimited(handleWriteBookmarkAnalysis)
)

// ---------------------------------------------------------------------------
// Layer 2: Collection tools (组合层)
// ---------------------------------------------------------------------------

// @ts-expect-error — MCP SDK TS2589
server.tool(
  'create_collection',
  'Create a new Collection to group related bookmarks together.',
  {
    name: z.string().min(1).max(200).describe('Collection name'),
    bookmark_ids: z.array(z.string()).optional().describe('Initial bookmark UUIDs to include'),
  },
  rateLimited(handleCreateCollection)
)

// @ts-expect-error — MCP SDK TS2589
server.tool(
  'add_to_collection',
  'Add bookmarks to an existing Collection. Duplicates are silently ignored.',
  {
    collection_id: z.string().describe('Collection UUID'),
    bookmark_ids: z.array(z.string()).min(1).max(50).describe('Bookmark UUIDs to add'),
  },
  rateLimited(handleAddToCollection)
)

server.tool(
  'remove_from_collection',
  'Remove bookmarks from a Collection.',
  {
    collection_id: z.string().describe('Collection UUID'),
    bookmark_ids: z.array(z.string()).min(1).describe('Bookmark UUIDs to remove'),
  },
  rateLimited(handleRemoveFromCollection)
)

// @ts-expect-error — MCP SDK TS2589
server.tool(
  'update_collection_overview',
  'Write an AI-generated overview for a Collection (theme, synthesis, patterns, gaps).',
  {
    collection_id: z.string().describe('Collection UUID'),
    overview: z.object({
      theme: z.string().describe('Overarching theme'),
      synthesis: z.string().optional().describe('Cross-bookmark synthesis'),
      patterns: z.array(z.string()).optional().describe('Patterns identified'),
      gaps: z.array(z.string()).optional().describe('Knowledge gaps identified'),
    }).describe('AI-generated overview'),
  },
  rateLimited(handleUpdateCollectionOverview)
)

// ---------------------------------------------------------------------------
// Resource: burn://vault/bookmarks
// ---------------------------------------------------------------------------

server.resource(
  'vault-bookmarks',
  'burn://vault/bookmarks',
  async (uri) => {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('status', 'absorbed')
      .order('created_at', { ascending: false })

    if (error) {
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: error.message }) }] }
    }

    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify((data || []).map(metaSummary), null, 2),
      }],
    }
  }
)

// ---------------------------------------------------------------------------
// Resource: burn://vault/categories
// ---------------------------------------------------------------------------

server.resource(
  'vault-categories',
  'burn://vault/categories',
  async (uri) => {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('content_metadata')
      .eq('status', 'absorbed')

    if (error) {
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: error.message }) }] }
    }

    const counts: Record<string, number> = {}
    for (const row of data || []) {
      const cat = (row.content_metadata as any)?.vault_category || 'Uncategorized'
      counts[cat] = (counts[cat] || 0) + 1
    }

    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          Object.entries(counts).map(([category, count]) => ({ category, count })),
          null, 2
        ),
      }],
    }
  }
)

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  await initAuth()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Burn MCP Server running on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
