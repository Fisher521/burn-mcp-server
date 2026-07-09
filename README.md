# Burn — Personal Knowledge Base MCP Server

[![npm version](https://img.shields.io/npm/v/burn-mcp-server.svg)](https://www.npmjs.com/package/burn-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Burn MCP](https://img.shields.io/badge/Burn%20MCP-26%20tools-FF6B35?labelColor=0a0a0a)](https://www.burn451.cloud/?ref=mcp-badge)

> Want this badge in your own README? Grab the markdown at [burn451.cloud/developers#badges](https://www.burn451.cloud/developers?ref=mcp-badge#badges).

Your reading data as an AI-accessible knowledge base. 26 tools for Claude, Cursor, Windsurf, and any MCP-compatible agent.

> **You need a free Burn account to use this server.** Install the [iOS app](https://apps.apple.com/app/burn451/id6759418544) or open [burn451.cloud](https://www.burn451.cloud/?ref=mcp-cli) → **Settings → MCP Server → Copy Access Token**. Burn has a free tier (5 saves/day, all 26 MCP tools included) and a Pro plan at $4.99/month for unlimited saves.

## How it works

Burn is a [read-later app with a 24-hour deadline](https://www.burn451.cloud/blog/best-read-later-app-2026?ref=mcp-readme) — saves auto-burn unless you read or rescue them. The honest answer to the [bookmark graveyard problem](https://www.burn451.cloud/bookmark-graveyard?ref=mcp-readme) where [94% of saves are never reopened](https://www.burn451.cloud/read-later-guilt?ref=mcp-readme).

Triage flow:
- **Flame** → New links. 24h to read or they burn.
- **Spark** → You read it. Stays 30 days.
- **Vault** → Permanent. Your curated knowledge.
- **Ash** → Expired. They had their chance.

The MCP server lets your AI agent search, triage, organize, and analyze everything you've saved. Built for [Claude users who want their reading history as context](https://www.burn451.cloud/mcp?ref=mcp-readme).

> **Migrating from another tool?** Burn is a [Pocket replacement](https://www.burn451.cloud/blog/pocket-replacement-2026?ref=mcp-readme) (Mozilla shut Pocket down July 2025), an [Omnivore alternative](https://www.burn451.cloud/alternatives/omnivore?ref=mcp-readme) (acquired by ElevenLabs late 2024), and a [Matter app alternative](https://www.burn451.cloud/blog/matter-app-alternative?ref=mcp-readme).

## Quick Start

### 1. Get your token

1. Create a free Burn account — [iOS app](https://apps.apple.com/app/burn451/id6759418544) or [web](https://www.burn451.cloud/?ref=mcp-cli)
2. Open the app → **Settings → MCP Server → Generate token → Copy**

The server exchanges your token for a short-lived Supabase session and caches it in `~/.burn/mcp-session.json`. No re-login on each run.

### 2. Add to Claude Desktop

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

### Add to Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "burn": {
      "command": "npx",
      "args": ["burn-mcp-server"],
      "env": { "BURN_MCP_TOKEN": "<your-token>" }
    }
  }
}
```

### Add to Claude Code (CLI)

```bash
claude mcp add burn -e BURN_MCP_TOKEN=<your-token> -- npx burn-mcp-server
```

## Example prompts

Reading triage:

- "Go through my Flame inbox, read each article, keep anything about AI agents and burn the rest."
- "What's about to expire in the next 6 hours that I'd regret losing?"

Knowledge retrieval:

- "Search my Vault for everything on context engineering and summarize the main schools of thought."
- "Which authors do I save most often? What does that say about my reading gaps?"

Research curation:

- "Create a collection called 'MCP in production' from my saves, then write an overview of what my sources agree and disagree on."
- "Add a watched source for Simon Willison's blog so new posts land in my Flame."

Writing with your own sources:

- "I'm writing about read-later apps. Pull every relevant bookmark I have and list the claims I can support with a source."

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

**Personal knowledge management** — Your agent searches your reading history to answer questions, find patterns, and surface forgotten gems. See [AI bookmark management concepts](https://www.burn451.cloud/concepts/ai-bookmark-management?ref=mcp-readme).

**Research workflows** — Create collections on topics you're exploring. Agent writes overviews synthesizing your sources. Examples: [vault as Karpathy LLM wiki](https://www.burn451.cloud/vault/karpathy?ref=mcp-readme), [Paul Graham vault](https://www.burn451.cloud/vault/paul-graham?ref=mcp-readme), [Simon Willison vault](https://www.burn451.cloud/vault/simon-willison?ref=mcp-readme).

**Reading triage** — Agent reviews your Flame inbox, reads the content, decides what's worth keeping. Solves the [reading list app](https://www.burn451.cloud/blog/reading-list-app?ref=mcp-readme) problem of saves piling up.

**Cross-tool intelligence** — Use with [Claude Code](https://www.burn451.cloud/mcp?ref=mcp-readme), Cursor, or Windsurf. Your bookmarks become context for coding, writing, and thinking. The [MCP server architecture](https://www.burn451.cloud/blog/mcp-read-later-server?ref=mcp-readme) is open and documented.

**Free vs paid choice** — Burn's free tier includes all 26 MCP tools (5 saves/day); Pro is $4.99/month. See [free bookmark manager comparison](https://www.burn451.cloud/blog/free-bookmark-manager?ref=mcp-readme) for honest landscape across 8 truly-free options.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BURN_MCP_TOKEN` | Yes* | Long-lived MCP token (recommended) |
| `BURN_SUPABASE_TOKEN` | Yes* | Legacy JWT token (still supported) |
| `BURN_API_URL` | No | Custom API URL (default: production) |

*One of `BURN_MCP_TOKEN` or `BURN_SUPABASE_TOKEN` required.

## Security

- Token scoped to your data only (Row Level Security)
- Status flow enforced: Flame → Spark → Vault, or → Ash
- Rate limit: 30 calls/min per session
- Tokens expire after 30 days

## Links

- **App**: [burn451.cloud](https://burn451.cloud?ref=mcp-readme-links)
- **iOS App**: [App Store](https://apps.apple.com/us/app/burn451/id6759418544)
- **npm**: [burn-mcp-server](https://www.npmjs.com/package/burn-mcp-server)
- **Chrome Extension**: Search "Bookmark Autopsy" on Chrome Web Store
- **Read-later app comparison (10 tools tested)**: [best-read-later-app-2026](https://www.burn451.cloud/blog/best-read-later-app-2026?ref=mcp-readme-links)
- **AI bookmark organizer rankings**: [best-ai-bookmark-manager-2026](https://www.burn451.cloud/blog/best-ai-bookmark-manager-2026?ref=mcp-readme-links)
- **Pocket alternative pillar**: [pocket-alternative-2026](https://www.burn451.cloud/blog/pocket-replacement-2026?ref=mcp-readme-links)
- **vs Raindrop comparison**: [burn-vs-raindrop](https://www.burn451.cloud/blog/burn-vs-raindrop?ref=mcp-readme-links)
- **Developer docs**: [burn451.cloud/developers](https://www.burn451.cloud/developers?ref=mcp-readme-links)

## License

MIT
