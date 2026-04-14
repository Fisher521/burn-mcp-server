export const config = { runtime: 'edge' }
export default async function handler(req) {
  return new Response(JSON.stringify({ ok: true, url: req.url, method: req.method, runtime: 'edge' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
