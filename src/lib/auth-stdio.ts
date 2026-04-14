// stdio-only: local session cache on disk (~/.burn/mcp-session.json)
// NEVER import this from http.ts — it pulls in node:fs/os/path which crashes Edge runtime.

import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Session } from './auth.js'

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
