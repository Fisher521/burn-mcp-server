// Vercel API route — Burn MCP HTTP endpoint
// Deploys to: https://<your-vercel-project>.vercel.app/api/mcp
// Or custom domain: https://mcp.burn451.cloud/api/mcp (or rewrite to /mcp)

import { handleMcpRequest } from '../src/http.js'

// Vercel Edge runtime supports Web Standard Request/Response directly
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  return handleMcpRequest(req)
}
