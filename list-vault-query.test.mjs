import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./src/index.ts', import.meta.url), 'utf8')
const handler = source.match(
  /async function handleListVault[\s\S]*?\n}\n\n\/\/ ---------------------------------------------------------------------------\n\/\/ Layer 1:/
)?.[0]

test('list_vault filters a JSON category in the database before ordering and limiting', () => {
  assert.ok(handler, 'handleListVault source should be present')

  const categoryFilter = handler.indexOf(
    ".ilike('content_metadata->>vault_category', args.category)"
  )
  const ordering = handler.indexOf(".order('created_at', { ascending: false })")
  const limiting = handler.indexOf('.limit(args.limit || 20)')

  assert.ok(categoryFilter >= 0, 'category should be filtered in the database')
  assert.ok(categoryFilter < ordering, 'category filter must run before ordering')
  assert.ok(ordering < limiting, 'ordering must run before limiting')
  assert.doesNotMatch(handler, /results\.filter\(/)
})
