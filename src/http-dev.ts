// Burn MCP — standalone Node HTTP dev server for local testing.
// For production deploy, see api/mcp.ts (Vercel Edge) or src/http.ts (the handler).

import { createServer } from 'node:http'
import { handleMcpRequest } from './http.js'

const PORT = Number(process.env.PORT) || 3001

const server = createServer(async (nodeReq, nodeRes) => {
  try {
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
  console.log(`Test: curl -H "Authorization: Bearer <TOKEN>" -X POST http://localhost:${PORT}/mcp \\`)
  console.log(`  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \\`)
  console.log(`  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`)
})
