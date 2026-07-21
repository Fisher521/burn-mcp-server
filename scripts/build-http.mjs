import { access } from 'node:fs/promises'

const prebuiltFunctions = [
  'api/mcp.js',
  'api/server-card.js',
  'public/index.html',
]

for (const file of prebuiltFunctions) {
  await access(file)
}

process.stdout.write(`Using ${prebuiltFunctions.length} checked-in Vercel deployment artifacts.\n`)
