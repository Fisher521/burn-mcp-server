'use strict'

// Public, credential-free MCP discovery metadata. Generated from the live tools/list response.
const SERVER_CARD = {
  "$schema": "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
  "version": "1.0",
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "burn-mcp-server",
    "title": "Burn",
    "version": "2.1.0",
    "websiteUrl": "https://burn451.cloud"
  },
  "description": "Personal Knowledge Base MCP — 26 tools that let AI agents work with a user's curated reading.",
  "documentationUrl": "https://www.burn451.cloud/mcp-demo",
  "transport": {
    "type": "streamable-http",
    "endpoint": "/api/mcp"
  },
  "capabilities": {
    "tools": {
      "listChanged": false
    }
  },
  "authentication": {
    "required": true,
    "schemes": [
      "bearer"
    ]
  },
  "instructions": "Generate a Burn MCP token in Burn Settings, then send it as Authorization: Bearer <BURN_MCP_TOKEN>.",
  "tools": [
    {
      "name": "search_vault",
      "description": "Search your Burn Vault for bookmarks by keyword (searches title, tags, AI takeaway)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search keyword"
          },
          "limit": {
            "type": "number",
            "description": "Max results (default 10)"
          }
        },
        "required": [
          "query"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "list_vault",
      "description": "List bookmarks in your Vault, optionally filtered by category",
      "inputSchema": {
        "type": "object",
        "properties": {
          "limit": {
            "type": "number",
            "description": "Max results (default 20)"
          },
          "category": {
            "type": "string",
            "description": "Filter by vault category"
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "list_sparks",
      "description": "List your Sparks (bookmarks you have read, with 30-day lifespan). Includes spark insight and expiry date.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "limit": {
            "type": "number",
            "description": "Max results (default 20)"
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "search_sparks",
      "description": "Search your Sparks by keyword (searches title, tags, AI takeaway, spark insight)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search keyword"
          },
          "limit": {
            "type": "number",
            "description": "Max results (default 10)"
          }
        },
        "required": [
          "query"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_bookmark",
      "description": "Get full details of a single bookmark including AI analysis and extracted content",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_article_content",
      "description": "Get full article content and AI analysis for a bookmark by ID (same as get_bookmark)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "fetch_content",
      "description": "Fetch article/tweet content from a URL. Works with X.com (bypasses GFW via proxy), Reddit, YouTube, Bilibili, WeChat, and any web page. First checks Supabase cache, then fetches live.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "description": "The URL to fetch content from"
          }
        },
        "required": [
          "url"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "list_categories",
      "description": "List all Vault categories with article counts",
      "inputSchema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {}
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "list_flame",
      "description": "List bookmarks in your Flame inbox (24h countdown). Shows AI triage info (strategy, relevance, novelty, hook) and time remaining. Use this to see what needs attention before it burns to Ash.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "limit": {
            "type": "number",
            "description": "Max results (default 20)"
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_flame_detail",
      "description": "Get full details of a Flame bookmark including extracted article content, AI analysis, and reading guidance. Use this to deep-read a bookmark before deciding its fate.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_collections",
      "description": "List all your Collections with article counts and AI overview themes",
      "inputSchema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {}
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_collection_overview",
      "description": "Get a Collection by name with its AI overview and linked bookmarks metadata",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Collection name"
          }
        },
        "required": [
          "name"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "move_flame_to_spark",
      "description": "Move a Flame bookmark to Spark (mark as worth reading). Sets 30-day Spark lifespan.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          },
          "spark_insight": {
            "type": "string",
            "maxLength": 500,
            "description": "One-line insight about why this is worth reading"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "move_flame_to_ash",
      "description": "Burn a Flame bookmark to Ash (not worth keeping).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          },
          "reason": {
            "type": "string",
            "maxLength": 200,
            "description": "Why this was burned"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "move_spark_to_vault",
      "description": "Promote a Spark bookmark to permanent Vault storage.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          },
          "vault_category": {
            "type": "string",
            "maxLength": 100,
            "description": "Category to file under in the Vault"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "move_spark_to_ash",
      "description": "Burn a Spark bookmark to Ash (not valuable enough to vault).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "batch_triage_flame",
      "description": "Triage multiple Flame bookmarks at once. Each decision moves a bookmark to Spark or Ash.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "decisions": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Bookmark UUID"
                },
                "action": {
                  "type": "string",
                  "enum": [
                    "spark",
                    "ash"
                  ],
                  "description": "spark = keep, ash = burn"
                },
                "spark_insight": {
                  "type": "string",
                  "maxLength": 500,
                  "description": "Insight (only for spark action)"
                }
              },
              "required": [
                "id",
                "action"
              ],
              "additionalProperties": false
            },
            "minItems": 1,
            "maxItems": 20,
            "description": "Array of triage decisions"
          }
        },
        "required": [
          "decisions"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "write_bookmark_analysis",
      "description": "Write AI analysis results into a bookmark. Agent analyzes content with its own LLM, then writes structured results back to Burn. Only provided fields are merged — existing data is preserved.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Bookmark UUID"
          },
          "analysis": {
            "type": "object",
            "properties": {
              "ai_summary": {
                "type": "string",
                "maxLength": 200,
                "description": "One-line summary"
              },
              "ai_strategy": {
                "type": "string",
                "enum": [
                  "deep_read",
                  "skim",
                  "skip_read",
                  "reference"
                ],
                "description": "Reading strategy"
              },
              "ai_strategy_reason": {
                "type": "string",
                "maxLength": 200,
                "description": "Why this strategy"
              },
              "ai_minutes": {
                "type": "integer",
                "minimum": 1,
                "maximum": 999,
                "description": "Estimated reading minutes"
              },
              "ai_takeaway": {
                "type": "array",
                "items": {
                  "type": "string",
                  "maxLength": 200
                },
                "maxItems": 5,
                "description": "Key takeaways"
              },
              "ai_relevance": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "Relevance score 0-100"
              },
              "ai_novelty": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "Novelty score 0-100"
              },
              "tags": {
                "type": "array",
                "items": {
                  "type": "string",
                  "maxLength": 50
                },
                "maxItems": 10,
                "description": "Topic tags"
              }
            },
            "additionalProperties": false,
            "description": "Analysis fields to write"
          }
        },
        "required": [
          "id",
          "analysis"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "create_collection",
      "description": "Create a new Collection to group related bookmarks together.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200,
            "description": "Collection name"
          },
          "bookmark_ids": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Initial bookmark UUIDs to include"
          }
        },
        "required": [
          "name"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "add_to_collection",
      "description": "Add bookmarks to an existing Collection. Duplicates are silently ignored.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "collection_id": {
            "type": "string",
            "description": "Collection UUID"
          },
          "bookmark_ids": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1,
            "maxItems": 50,
            "description": "Bookmark UUIDs to add"
          }
        },
        "required": [
          "collection_id",
          "bookmark_ids"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "remove_from_collection",
      "description": "Remove bookmarks from a Collection.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "collection_id": {
            "type": "string",
            "description": "Collection UUID"
          },
          "bookmark_ids": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1,
            "description": "Bookmark UUIDs to remove"
          }
        },
        "required": [
          "collection_id",
          "bookmark_ids"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "update_collection_overview",
      "description": "Write an AI-generated overview for a Collection (theme, synthesis, patterns, gaps).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "collection_id": {
            "type": "string",
            "description": "Collection UUID"
          },
          "overview": {
            "type": "object",
            "properties": {
              "theme": {
                "type": "string",
                "description": "Overarching theme"
              },
              "synthesis": {
                "type": "string",
                "description": "Cross-bookmark synthesis"
              },
              "patterns": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Patterns identified"
              },
              "gaps": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Knowledge gaps identified"
              }
            },
            "required": [
              "theme"
            ],
            "additionalProperties": false,
            "description": "AI-generated overview"
          }
        },
        "required": [
          "collection_id",
          "overview"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "add_watched_source",
      "description": "Watch an X user, RSS feed, or YouTube channel — new posts auto-appear in Burn Flame on each scrape.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "source_type": {
            "type": "string",
            "enum": [
              "x_user",
              "rss",
              "youtube"
            ],
            "description": "x_user = Twitter/X handle | rss = any RSS/Atom feed URL | youtube = YouTube channel ID"
          },
          "handle": {
            "type": "string",
            "description": "x_user: username without @ (e.g. \"karpathy\") | rss: full feed URL | youtube: channel ID starting with UC"
          },
          "name": {
            "type": "string",
            "description": "Human-friendly display name (defaults to handle)"
          }
        },
        "required": [
          "source_type",
          "handle"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "list_watched_sources",
      "description": "List all active watched sources (X users, RSS feeds, YouTube channels).",
      "inputSchema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {}
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "remove_watched_source",
      "description": "Stop watching a source. Use list_watched_sources to find the source ID.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Watched source UUID from list_watched_sources"
          }
        },
        "required": [
          "id"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "scrape_watched_sources",
      "description": "Fetch new content from all watched sources (or one specific source) and add new items to Burn Flame. Call this on a schedule or on demand.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "source_id": {
            "type": "string",
            "description": "Scrape only this source ID — omit to scrape all active sources"
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    }
  ],
  "resources": [],
  "prompts": []
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, HEAD')
    res.end('Method Not Allowed')
    return
  }

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET')
  res.setHeader('access-control-allow-headers', 'Content-Type')
  res.setHeader('cache-control', 'public, max-age=3600')
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(SERVER_CARD))
}

module.exports = handler
module.exports.SERVER_CARD = SERVER_CARD
