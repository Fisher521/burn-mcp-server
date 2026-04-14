# Burn — Personal Knowledge Base MCP Server

[![npm version](https://img.shields.io/npm/v/burn-mcp-server.svg)](https://www.npmjs.com/package/burn-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Your reading data as an AI-accessible knowledge base. 26 tools for Claude, Cursor, Windsurf, and any MCP-compatible agent.

## How it works

Burn triages your reading with a 24h timer:
- **Flame** → New links. 24h to read or they burn.
- **Spark** → You read it. Stays 30 days.
- **Vault** → Permanent. Your curated knowledge.
- **Ash** → Expired. They had their chance.

The MCP server lets your AI agent search, triage, organize, and analyze everything you've saved.

## Quick Start

### 1. Get your token

Download [Burn on iOS](https://apps.apple.com/app/burn451/id6759418544) or use [Burn on the web](https://burn451.cloud) → Settings → MCP Server → **Copy Access Token**

### 2. Connect (pick one)

#### Option A — Remote HTTP (recommended, no install)

Add this URL to your MCP client. Works with Claude Desktop, Cursor, Windsurf, ChatGPT desktop, anything that speaks MCP Streamable HTTP:

```
https://mcp.burn451.cloud/mcp
```

Authorization header: `Bearer <your-token>`

Claude Desktop config:
```json
{
  "mcpServers": {
    "burn": {
      "url": "https://mcp.burn451.cloud/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

No Node install, no npx, no local process — one URL and you're in.

#### Option B — Local stdio (npm install)

For offline / privacy-sensitive setups where you don't want requests going through burn451.cloud:

```json
{
  "mcpServers": {
    "burn": {
      "command": "npx",
      "args": ["burn-mcp-server"],
      "env": {
        "BURN_MCP_TOKEN": "<your-token>"
      }
    }
  }
}
```

### 3. Start asking

- "What did I save about system design?"
- "Triage my Flame — what should I keep?"
- "Create a collection from my AI bookmarks"

## Tools (26)

### Search & Read

| Tool | What it does |
|------|-------------|
| `search_vault` | Search permanent bookmarks by keyword |
| `list_vault` | List Vault bookmarks by category |
| `list_sparks` | List recently read bookmarks (30-day window) |
| `search_sparks` | Search Sparks by keyword |
| `list_flame` | List inbox — what's about to burn |
| `get_flame_detail` | Full detail on a Flame bookmark |
| `get_bookmark` | Get any bookmark by ID |
| `get_article_content` | Get full article content + analysis |
| `fetch_content` | Fetch content from a URL (X, Reddit, YouTube, WeChat) |
| `list_categories` | All Vault categories with counts |
| `get_collections` | List all Collections |
| `get_collection_overview` | Collection detail with AI overview |

### Triage (Agent as your filter)

| Tool | What it does |
|------|-------------|
| `move_flame_to_spark` | Keep it — worth reading. Optional insight. |
| `move_flame_to_ash` | Burn it. Optional reason. |
| `move_spark_to_vault` | Promote to permanent. Optional category. |
| `move_spark_to_ash` | Not valuable enough to keep. |
| `batch_triage_flame` | Triage up to 20 at once. |

### Collections (Agent as your curator)

| Tool | What it does |
|------|-------------|
| `create_collection` | Create a topic bundle with initial bookmarks |
| `add_to_collection` | Add bookmarks (deduplicates) |
| `remove_from_collection` | Remove bookmarks |
| `update_collection_overview` | Write AI overview (theme, synthesis, gaps) |

### Analysis (Agent as your analyst)

| Tool | What it does |
|------|-------------|
| `write_bookmark_analysis` | Write structured analysis back to a bookmark |

### Auto-Feed (Agent as your scout)

| Tool | What it does |
|------|-------------|
| `add_watched_source` | Watch an X user, RSS feed, or YouTube channel. New posts flow into Flame automatically. |
| `list_watched_sources` | List all active watched sources |
| `remove_watched_source` | Stop watching a source |
| `scrape_watched_sources` | Fetch new content from watched sources on demand |

## Resources

| URI | Content |
|-----|---------|
| `burn://vault/bookmarks` | All Vault bookmarks (JSON) |
| `burn://vault/categories` | Category list (JSON) |

## Use Cases

**Personal knowledge management** — Your agent searches your reading history to answer questions, find patterns, and surface forgotten gems.

**Research workflows** — Create collections on topics you're exploring. Agent writes overviews synthesizing your sources.

**Reading triage** — Agent reviews your Flame inbox, reads the content, decides what's worth keeping based on your interests.

**Cross-tool intelligence** — Use with Claude Code, Cursor, or Windsurf. Your bookmarks become context for coding, writing, and thinking.

## Environment Variables (stdio mode)

| Variable | Required | Description |
|----------|----------|-------------|
| `BURN_MCP_TOKEN` | Yes* | Long-lived MCP token (recommended) |
| `BURN_SUPABASE_TOKEN` | Yes* | Legacy JWT token (still supported) |
| `BURN_API_URL` | No | Custom API URL (default: production) |

*One of `BURN_MCP_TOKEN` or `BURN_SUPABASE_TOKEN` required.

## Transports

This server ships two transports from the same tool set:

| Transport | Entry | Who it's for |
|---|---|---|
| **Streamable HTTP** (`src/http.ts` → `api/mcp.ts`) | Remote server (Vercel Edge) | Most users — paste one URL, done |
| **stdio** (`src/index.ts`) | `npx burn-mcp-server` | Offline / privacy-first users |

### Self-hosting the HTTP server

```bash
git clone https://github.com/Fisher521/burn-mcp-server
cd burn-mcp-server
npm install
npm run build:http
PORT=3791 node dist/http.mjs
# test:
curl -sS -X POST http://localhost:3791 \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Or deploy to Vercel (one-click): `vercel --prod` in repo root. Config is in `vercel.json`.

## Security

- Token scoped to your data only (Row Level Security)
- Status flow enforced: Flame → Spark → Vault, or → Ash
- Rate limit: 30 calls/min per session
- Tokens expire after 30 days

## Links

- **App**: [burn451.cloud](https://burn451.cloud)
- **iOS App**: [App Store](https://apps.apple.com/us/app/burn451/id6759418544)
- **npm**: [burn-mcp-server](https://www.npmjs.com/package/burn-mcp-server)
- **Chrome Extension**: Search "Bookmark Autopsy" on Chrome Web Store

## License

MIT
