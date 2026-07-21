import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const handler = require('./api/server-card.js')
const { SERVER_CARD } = handler

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

test('server card exposes the canonical public metadata and 26 unique tools', () => {
  assert.equal(SERVER_CARD.serverInfo.name, 'burn-mcp-server')
  assert.equal(SERVER_CARD.serverInfo.version, '2.1.0')
  assert.equal(SERVER_CARD.serverInfo.websiteUrl, 'https://burn451.cloud')
  assert.equal(SERVER_CARD.documentationUrl, 'https://burn451.cloud/mcp-demo')
  assert.deepEqual(SERVER_CARD.authentication, { required: true, schemes: ['bearer'] })
  assert.equal(SERVER_CARD.tools.length, 26)
  assert.equal(new Set(SERVER_CARD.tools.map((tool) => tool.name)).size, 26)

  for (const tool of SERVER_CARD.tools) {
    assert.equal(typeof tool.name, 'string')
    assert.equal(typeof tool.description, 'string')
    assert.equal(tool.inputSchema.type, 'object')
  }
})

test('GET returns the public card with discovery CORS and caching', () => {
  const res = responseRecorder()
  handler({ method: 'GET' }, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assert.equal(res.headers['cache-control'], 'public, max-age=3600')
  assert.equal(JSON.parse(res.body).tools.length, 26)
})

test('HEAD omits the response body and unsupported methods are rejected', () => {
  const head = responseRecorder()
  handler({ method: 'HEAD' }, head)
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, '')

  const post = responseRecorder()
  handler({ method: 'POST' }, post)
  assert.equal(post.statusCode, 405)
  assert.equal(post.headers.allow, 'GET, HEAD')
})
