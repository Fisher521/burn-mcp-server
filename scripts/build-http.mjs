import { access } from 'node:fs/promises'

const prebuiltFunctions = [
  'api/mcp.js',
  'api/server-card.js',
]

for (const file of prebuiltFunctions) {
  await access(file)
}

process.stdout.write(`Using ${prebuiltFunctions.length} checked-in Vercel function bundles.\n`)
