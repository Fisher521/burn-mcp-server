// src/http.ts
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";

// src/lib/auth.ts
var DEFAULT_EXCHANGE_URL = "https://api.burn451.cloud/api/mcp-exchange";
async function exchangeToken(mcpToken, exchangeUrl = process.env.BURN_MCP_EXCHANGE_URL || DEFAULT_EXCHANGE_URL) {
  const resp = await fetch(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: mcpToken })
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await resp.json());
    } catch {
    }
    throw new Error(`Token exchange failed (${resp.status}): ${detail}`);
  }
  const data = await resp.json();
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Token exchange succeeded but returned no session tokens");
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token };
}
var httpSessionCache = /* @__PURE__ */ new Map();
var HTTP_CACHE_TTL_MS = 5 * 6e4;
async function getOrExchangeSession(mcpToken) {
  const now = Date.now();
  const cached = httpSessionCache.get(mcpToken);
  if (cached && cached.expiresAt > now) return cached.session;
  const session = await exchangeToken(mcpToken);
  httpSessionCache.set(mcpToken, { session, expiresAt: now + HTTP_CACHE_TTL_MS });
  return session;
}

// src/setup.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
function createBurnServer(supabase, opts = {}) {
  const RATE_LIMIT_WINDOW_MS = 6e4;
  const RATE_LIMIT_MAX_CALLS = opts.rateLimitPerMin ?? 30;
  const rateLimitLog = [];
  function checkRateLimit() {
    if (RATE_LIMIT_MAX_CALLS === 0) return null;
    const now = Date.now();
    while (rateLimitLog.length > 0 && rateLimitLog[0] < now - RATE_LIMIT_WINDOW_MS) {
      rateLimitLog.shift();
    }
    if (rateLimitLog.length >= RATE_LIMIT_MAX_CALLS) {
      const retryAfter = Math.ceil((rateLimitLog[0] + RATE_LIMIT_WINDOW_MS - now) / 1e3);
      return `Rate limit exceeded (${RATE_LIMIT_MAX_CALLS} calls/min). Retry after ${retryAfter}s.`;
    }
    rateLimitLog.push(now);
    return null;
  }
  const server = new McpServer({
    name: opts.name || "burn-mcp-server",
    version: opts.version || "2.0.7"
  });
  function textResult(text) {
    return { content: [{ type: "text", text }] };
  }
  async function verifyBookmark(id, expectedStatus) {
    const { data, error } = await supabase.from("bookmarks").select("*").eq("id", id).single();
    if (error) return { data: null, error: error.code === "PGRST116" ? "Bookmark not found" : error.message };
    if (expectedStatus) {
      const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      if (!allowed.includes(data.status)) {
        const statusLabels = { active: "Flame", read: "Spark", absorbed: "Vault", ash: "Ash" };
        return { data, error: `Bookmark is in ${statusLabels[data.status] || data.status} (expected ${allowed.map((s) => statusLabels[s] || s).join(" or ")})` };
      }
    }
    return { data, error: null };
  }
  async function mergeContentMetadata(bookmarkId, fields, extraColumns) {
    const { data, error } = await supabase.from("bookmarks").select("content_metadata").eq("id", bookmarkId).single();
    if (error) return { error: error.message };
    const existing = data.content_metadata || {};
    const cleaned = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== void 0 && v !== null) cleaned[k] = v;
    }
    const merged = { ...existing, ...cleaned };
    const { error: updateError } = await supabase.from("bookmarks").update({ content_metadata: merged, ...extraColumns }).eq("id", bookmarkId);
    return { error: updateError?.message || null };
  }
  function meta(row) {
    const m = row.content_metadata || {};
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      author: m.author || row.author || null,
      platform: row.platform,
      status: row.status,
      tags: m.tags || [],
      thumbnail: m.thumbnail || null,
      vaultCategory: m.vault_category || null,
      vaultedAt: m.vaulted_at || null,
      aiPositioning: m.ai_positioning || null,
      aiDensity: m.ai_density || null,
      aiMinutes: m.ai_minutes || null,
      aiTakeaway: m.ai_takeaway || [],
      aiStrategyReason: m.ai_strategy_reason || null,
      aiHowToRead: m.ai_how_to_read || null,
      aiOverlap: m.ai_overlap || null,
      aiVerdict: m.ai_verdict || null,
      aiSummary: m.ai_summary || null,
      sparkInsight: m.spark_insight || null,
      extractedContent: m.extracted_content || null,
      externalURL: m.external_url || null,
      aiRelevance: m.ai_relevance || null,
      aiNovelty: m.ai_novelty || null,
      createdAt: row.created_at,
      countdownExpiresAt: row.countdown_expires_at,
      readAt: row.read_at
    };
  }
  function metaSummary(row) {
    const m = row.content_metadata || {};
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      author: m.author || null,
      platform: row.platform,
      tags: m.tags || [],
      vaultCategory: m.vault_category || null,
      vaultedAt: m.vaulted_at || null,
      aiPositioning: m.ai_positioning || null,
      aiTakeaway: m.ai_takeaway || []
    };
  }
  function flameSummary(row) {
    const m = row.content_metadata || {};
    const expiresAt = row.countdown_expires_at ? new Date(row.countdown_expires_at) : null;
    const now = /* @__PURE__ */ new Date();
    const remainingMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0;
    const remainingHours = Math.max(0, Math.round(remainingMs / 36e5 * 10) / 10);
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      author: m.author || null,
      platform: row.platform,
      tags: m.tags || [],
      createdAt: row.created_at,
      expiresAt: row.countdown_expires_at,
      remainingHours,
      isBurning: remainingHours <= 6,
      isCritical: remainingHours <= 1,
      aiPositioning: m.ai_positioning || null,
      aiDensity: m.ai_density || null,
      aiMinutes: m.ai_minutes || null,
      aiTakeaway: m.ai_takeaway || [],
      aiStrategy: m.ai_strategy || null,
      aiStrategyReason: m.ai_strategy_reason || null,
      aiHowToRead: m.ai_how_to_read || null,
      aiRelevance: m.ai_relevance || null,
      aiNovelty: m.ai_novelty || null,
      aiOverlap: m.ai_overlap || null,
      aiHook: m.ai_hook || null,
      aiAbout: m.ai_about || []
    };
  }
  function rateLimited(handler2) {
    return async (args) => {
      const err = checkRateLimit();
      if (err) return textResult(err);
      return handler2(args);
    };
  }
  async function handleSearchVault(args) {
    const { query, limit } = args;
    const { data, error } = await supabase.from("bookmarks").select("*").eq("status", "absorbed").ilike("title", `%${query}%`).order("created_at", { ascending: false }).limit(limit || 10);
    if (error) return textResult(`Error: ${error.message}`);
    let results = (data || []).map(metaSummary);
    if (results.length < (limit || 10)) {
      const { data: tagData } = await supabase.from("bookmarks").select("*").eq("status", "absorbed").order("created_at", { ascending: false }).limit(50);
      if (tagData) {
        const existingIds = new Set(results.map((r) => r.id));
        const tagMatches = tagData.filter((row) => {
          if (existingIds.has(row.id)) return false;
          const m = row.content_metadata || {};
          const tags = m.tags || [];
          const takeaway = m.ai_takeaway || [];
          const positioning = m.ai_positioning || "";
          const allText = [...tags, ...takeaway, positioning].join(" ").toLowerCase();
          return allText.includes(query.toLowerCase());
        }).map(metaSummary);
        results = [...results, ...tagMatches].slice(0, limit || 10);
      }
    }
    return textResult(JSON.stringify(results, null, 2));
  }
  async function handleGetBookmark(args) {
    const { data, error } = await supabase.from("bookmarks").select("*").eq("id", args.id).single();
    if (error) return textResult(`Error: ${error.message}`);
    return textResult(JSON.stringify(meta(data), null, 2));
  }
  async function handleListCategories() {
    const { data, error } = await supabase.from("bookmarks").select("content_metadata").eq("status", "absorbed");
    if (error) return textResult(`Error: ${error.message}`);
    const counts = {};
    for (const row of data || []) {
      const cat = row.content_metadata?.vault_category || "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const categories = Object.entries(counts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
    return textResult(JSON.stringify(categories, null, 2));
  }
  async function handleGetCollections() {
    const { data, error } = await supabase.from("collections").select("id, name, bookmark_ids, ai_overview");
    if (error) return textResult(`Error: ${error.message}`);
    const collections = (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      articleCount: Array.isArray(c.bookmark_ids) ? c.bookmark_ids.length : 0,
      overview: c.ai_overview?.theme || null
    }));
    return textResult(JSON.stringify(collections, null, 2));
  }
  async function handleGetCollectionOverview(args) {
    const { data: collection, error } = await supabase.from("collections").select("*").eq("name", args.name).single();
    if (error) {
      return textResult(
        error.code === "PGRST116" ? `No collection found with name "${args.name}".` : `Error: ${error.message}`
      );
    }
    let bookmarks = [];
    if (Array.isArray(collection.bookmark_ids) && collection.bookmark_ids.length > 0) {
      const { data: bData, error: bError } = await supabase.from("bookmarks").select("*").in("id", collection.bookmark_ids);
      if (!bError && bData) {
        bookmarks = bData.map(metaSummary);
      }
    }
    return textResult(JSON.stringify({
      id: collection.id,
      name: collection.name,
      articleCount: Array.isArray(collection.bookmark_ids) ? collection.bookmark_ids.length : 0,
      aiOverview: collection.ai_overview,
      bookmarks
    }, null, 2));
  }
  async function handleGetArticleContent(args) {
    const { data, error } = await supabase.from("bookmarks").select("*").eq("id", args.id).single();
    if (error) return textResult(`Error: ${error.message}`);
    return textResult(JSON.stringify(meta(data), null, 2));
  }
  const API_BASE = process.env.BURN_API_URL || "https://api.burn451.cloud";
  const API_KEY = process.env.BURN_API_KEY;
  function detectPlatform(url) {
    if (/x\.com|twitter\.com/i.test(url)) return "x";
    if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
    if (/reddit\.com|redd\.it/i.test(url)) return "reddit";
    if (/bilibili\.com|b23\.tv/i.test(url)) return "bilibili";
    if (/open\.spotify\.com/i.test(url)) return "spotify";
    if (/mp\.weixin\.qq\.com/i.test(url)) return "wechat";
    if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return "xhs";
    return "web";
  }
  async function fetchViaAPI(url, platform) {
    try {
      let endpoint;
      let params;
      switch (platform) {
        case "x":
          endpoint = `${API_BASE}/api/parse-x`;
          params = `url=${encodeURIComponent(url)}`;
          break;
        case "reddit":
          endpoint = `${API_BASE}/api/parse-reddit`;
          params = `url=${encodeURIComponent(url)}`;
          break;
        case "spotify":
          endpoint = `${API_BASE}/api/parse-meta`;
          params = `url=${encodeURIComponent(url)}&_platform=spotify`;
          break;
        case "wechat":
        case "xhs":
          endpoint = `${API_BASE}/api/parse-meta`;
          params = `url=${encodeURIComponent(url)}&_platform=${platform}`;
          break;
        case "youtube":
          endpoint = `${API_BASE}/api/jina-extract`;
          params = `url=${encodeURIComponent(url)}&_platform=youtube`;
          break;
        default:
          endpoint = `${API_BASE}/api/jina-extract`;
          params = `url=${encodeURIComponent(url)}`;
          break;
      }
      const resp = await fetch(`${endpoint}?${params}`, {
        headers: {
          ...API_KEY ? { "x-api-key": API_KEY } : {},
          "Accept": "application/json"
        },
        signal: AbortSignal.timeout(3e4)
      });
      if (!resp.ok) {
        return { error: `API returned ${resp.status}` };
      }
      const data = await resp.json();
      if (platform === "x") {
        const text = data.text || data.article_text || "";
        const quoteText = data.quote ? `

[Quote from @${data.quote.handle}]: ${data.quote.text}` : "";
        return {
          title: data.text?.slice(0, 100) || "Tweet",
          author: data.author ? `@${data.handle || data.author}` : void 0,
          content: text + quoteText
        };
      }
      if (platform === "spotify") {
        return {
          title: data.title,
          author: data.author,
          content: data.extracted_content || data.description || null
        };
      }
      if (platform === "wechat") {
        return {
          title: data.title,
          author: data.author,
          content: data.extracted_content || data.content || null
        };
      }
      return {
        title: data.title,
        author: data.author,
        content: data.content || data.extracted_content || data.text || data.transcript || null
      };
    } catch (err) {
      return { error: err.message || "Fetch failed" };
    }
  }
  async function handleFetchContent(args) {
    const { url } = args;
    const platform = detectPlatform(url);
    const { data: existing } = await supabase.from("bookmarks").select("*").eq("url", url).limit(1).maybeSingle();
    if (existing) {
      const m = existing.content_metadata || {};
      if (m.extracted_content && m.extracted_content.length > 50) {
        return textResult(JSON.stringify({
          source: "cache",
          url,
          platform,
          title: existing.title,
          author: m.author,
          content: m.extracted_content,
          aiPositioning: m.ai_positioning,
          aiTakeaway: m.ai_takeaway,
          tags: m.tags
        }, null, 2));
      }
    }
    const result = await fetchViaAPI(url, platform);
    if (result.error) {
      return textResult(JSON.stringify({
        source: "error",
        url,
        platform,
        error: result.error,
        hint: platform === "x" ? "X.com content is fetched via Vercel Edge proxy to bypass GFW" : void 0
      }, null, 2));
    }
    return textResult(JSON.stringify({
      source: "live",
      url,
      platform,
      title: result.title,
      author: result.author,
      content: result.content
    }, null, 2));
  }
  async function handleListSparks(args) {
    const { data, error } = await supabase.from("bookmarks").select("*").eq("status", "read").order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return textResult(`Error: ${error.message}`);
    const results = (data || []).map((row) => {
      const s = metaSummary(row);
      const m = row.content_metadata || {};
      return {
        ...s,
        sparkInsight: m.spark_insight || null,
        sparkExpiresAt: m.spark_expires_at || null
      };
    });
    return textResult(JSON.stringify(results, null, 2));
  }
  async function handleSearchSparks(args) {
    const { query, limit } = args;
    const { data, error } = await supabase.from("bookmarks").select("*").eq("status", "read").order("created_at", { ascending: false }).limit(50);
    if (error) return textResult(`Error: ${error.message}`);
    const results = (data || []).filter((row) => {
      const m = row.content_metadata || {};
      const searchable = [
        row.title || "",
        ...m.tags || [],
        ...m.ai_takeaway || [],
        m.ai_positioning || "",
        m.spark_insight || ""
      ].join(" ").toLowerCase();
      return searchable.includes(query.toLowerCase());
    }).slice(0, limit || 10).map((row) => {
      const s = metaSummary(row);
      const m = row.content_metadata || {};
      return {
        ...s,
        sparkInsight: m.spark_insight || null,
        sparkExpiresAt: m.spark_expires_at || null
      };
    });
    return textResult(JSON.stringify(results, null, 2));
  }
  async function handleListFlame(args) {
    const { data, error } = await supabase.from("bookmarks").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(args.limit || 20);
    if (error) return textResult(`Error: ${error.message}`);
    const now = /* @__PURE__ */ new Date();
    const results = (data || []).filter((row) => {
      if (!row.countdown_expires_at) return true;
      return new Date(row.countdown_expires_at).getTime() > now.getTime();
    }).map(flameSummary);
    return textResult(JSON.stringify(results, null, 2));
  }
  async function handleGetFlameDetail(args) {
    const { data, error } = await supabase.from("bookmarks").select("*").eq("id", args.id).eq("status", "active").single();
    if (error) {
      return textResult(
        error.code === "PGRST116" ? `No active Flame bookmark found with id "${args.id}". It may have already burned to Ash or been moved to Spark/Vault.` : `Error: ${error.message}`
      );
    }
    const m = data.content_metadata || {};
    const expiresAt = data.countdown_expires_at ? new Date(data.countdown_expires_at) : null;
    const now = /* @__PURE__ */ new Date();
    const remainingMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0;
    const remainingHours = Math.max(0, Math.round(remainingMs / 36e5 * 10) / 10);
    const result = {
      ...flameSummary(data),
      extractedContent: m.extracted_content || null,
      externalURL: m.external_url || null,
      thumbnail: m.thumbnail || null,
      aiFocus: m.ai_focus || null,
      aiUse: m.ai_use || null,
      aiBuzz: m.ai_buzz || null
    };
    return textResult(JSON.stringify(result, null, 2));
  }
  async function handleListVault(args) {
    let query = supabase.from("bookmarks").select("*").eq("status", "absorbed").order("created_at", { ascending: false }).limit(args.limit || 20);
    const { data, error } = await query;
    if (error) return textResult(`Error: ${error.message}`);
    let results = (data || []).map(metaSummary);
    if (args.category) {
      results = results.filter(
        (r) => r.vaultCategory?.toLowerCase() === args.category.toLowerCase()
      );
    }
    return textResult(JSON.stringify(results, null, 2));
  }
  async function handleMoveFlameToSpark(args) {
    const { data, error } = await verifyBookmark(args.id, "active");
    if (error) return textResult(`Error: ${error}`);
    const sparkExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
    const metaFields = { spark_expires_at: sparkExpiresAt };
    if (args.spark_insight) metaFields.spark_insight = args.spark_insight;
    const { error: mergeErr } = await mergeContentMetadata(args.id, metaFields, {
      status: "read",
      read_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (mergeErr) return textResult(`Error: ${mergeErr}`);
    return textResult(JSON.stringify({
      success: true,
      id: args.id,
      title: data.title,
      action: "flame \u2192 spark",
      sparkExpiresAt
    }, null, 2));
  }
  async function handleMoveFlameToAsh(args) {
    const { data, error } = await verifyBookmark(args.id, "active");
    if (error) return textResult(`Error: ${error}`);
    const { error: updateErr } = await supabase.from("bookmarks").update({ status: "ash" }).eq("id", args.id);
    if (updateErr) return textResult(`Error: ${updateErr.message}`);
    return textResult(JSON.stringify({
      success: true,
      id: args.id,
      title: data.title,
      action: "flame \u2192 ash",
      reason: args.reason || null
    }, null, 2));
  }
  async function handleMoveSparkToVault(args) {
    const { data, error } = await verifyBookmark(args.id, "read");
    if (error) return textResult(`Error: ${error}`);
    const metaFields = { vaulted_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (args.vault_category) metaFields.vault_category = args.vault_category;
    const { error: mergeErr } = await mergeContentMetadata(args.id, metaFields, {
      status: "absorbed"
    });
    if (mergeErr) return textResult(`Error: ${mergeErr}`);
    return textResult(JSON.stringify({
      success: true,
      id: args.id,
      title: data.title,
      action: "spark \u2192 vault",
      vaultCategory: args.vault_category || null
    }, null, 2));
  }
  async function handleMoveSparkToAsh(args) {
    const { data, error } = await verifyBookmark(args.id, "read");
    if (error) return textResult(`Error: ${error}`);
    const { error: updateErr } = await supabase.from("bookmarks").update({ status: "ash" }).eq("id", args.id);
    if (updateErr) return textResult(`Error: ${updateErr.message}`);
    return textResult(JSON.stringify({
      success: true,
      id: args.id,
      title: data.title,
      action: "spark \u2192 ash"
    }, null, 2));
  }
  async function handleBatchTriageFlame(args) {
    const results = [];
    for (const decision of args.decisions) {
      if (decision.action === "spark") {
        const res = await handleMoveFlameToSpark({ id: decision.id, spark_insight: decision.spark_insight });
        const parsed = JSON.parse(res.content[0].text);
        results.push({ id: decision.id, action: "flame \u2192 spark", success: !!parsed.success, error: parsed.success ? void 0 : res.content[0].text, title: parsed.title });
      } else {
        const res = await handleMoveFlameToAsh({ id: decision.id });
        const parsed = JSON.parse(res.content[0].text);
        results.push({ id: decision.id, action: "flame \u2192 ash", success: !!parsed.success, error: parsed.success ? void 0 : res.content[0].text, title: parsed.title });
      }
    }
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return textResult(JSON.stringify({
      summary: `${succeeded} succeeded, ${failed} failed (of ${results.length} total)`,
      results
    }, null, 2));
  }
  async function handleWriteBookmarkAnalysis(args) {
    const { data, error } = await verifyBookmark(args.id);
    if (error) return textResult(`Error: ${error}`);
    const { error: mergeErr } = await mergeContentMetadata(args.id, args.analysis);
    if (mergeErr) return textResult(`Error: ${mergeErr}`);
    const fieldsWritten = Object.keys(args.analysis).filter((k) => args.analysis[k] !== void 0);
    return textResult(JSON.stringify({
      success: true,
      id: args.id,
      title: data.title,
      fieldsWritten
    }, null, 2));
  }
  async function handleCreateCollection(args) {
    const { data: sample } = await supabase.from("bookmarks").select("user_id").limit(1).single();
    if (!sample) return textResult("Error: No bookmarks found \u2014 cannot determine user ID");
    const bookmarkIds = args.bookmark_ids || [];
    if (bookmarkIds.length > 0) {
      const { data: existing } = await supabase.from("bookmarks").select("id").in("id", bookmarkIds);
      const existingIds = new Set((existing || []).map((b) => b.id));
      const missing = bookmarkIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        return textResult(`Error: Bookmark IDs not found: ${missing.join(", ")}`);
      }
    }
    const { data, error } = await supabase.from("collections").insert({
      user_id: sample.user_id,
      name: args.name,
      bookmark_ids: bookmarkIds,
      is_overview_stale: true
    }).select().single();
    if (error) return textResult(`Error: ${error.message}`);
    return textResult(JSON.stringify({
      success: true,
      id: data.id,
      name: data.name,
      articleCount: bookmarkIds.length
    }, null, 2));
  }
  async function handleAddToCollection(args) {
    const { data: collection, error } = await supabase.from("collections").select("*").eq("id", args.collection_id).single();
    if (error) {
      return textResult(error.code === "PGRST116" ? "Error: Collection not found" : `Error: ${error.message}`);
    }
    const { data: existing } = await supabase.from("bookmarks").select("id").in("id", args.bookmark_ids);
    const existingIds = new Set((existing || []).map((b) => b.id));
    const missing = args.bookmark_ids.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      return textResult(`Error: Bookmark IDs not found: ${missing.join(", ")}`);
    }
    const currentIds = new Set(collection.bookmark_ids || []);
    const newIds = args.bookmark_ids.filter((id) => !currentIds.has(id));
    const merged = [...collection.bookmark_ids || [], ...newIds];
    const { error: updateErr } = await supabase.from("collections").update({ bookmark_ids: merged, is_overview_stale: true }).eq("id", args.collection_id);
    if (updateErr) return textResult(`Error: ${updateErr.message}`);
    return textResult(JSON.stringify({
      success: true,
      collectionId: args.collection_id,
      name: collection.name,
      added: newIds.length,
      alreadyPresent: args.bookmark_ids.length - newIds.length,
      totalArticles: merged.length
    }, null, 2));
  }
  async function handleRemoveFromCollection(args) {
    const { data: collection, error } = await supabase.from("collections").select("*").eq("id", args.collection_id).single();
    if (error) {
      return textResult(error.code === "PGRST116" ? "Error: Collection not found" : `Error: ${error.message}`);
    }
    const removeSet = new Set(args.bookmark_ids);
    const filtered = (collection.bookmark_ids || []).filter((id) => !removeSet.has(id));
    const removed = (collection.bookmark_ids || []).length - filtered.length;
    const { error: updateErr } = await supabase.from("collections").update({ bookmark_ids: filtered, is_overview_stale: true }).eq("id", args.collection_id);
    if (updateErr) return textResult(`Error: ${updateErr.message}`);
    return textResult(JSON.stringify({
      success: true,
      collectionId: args.collection_id,
      name: collection.name,
      removed,
      totalArticles: filtered.length
    }, null, 2));
  }
  async function handleUpdateCollectionOverview(args) {
    const { data: collection, error } = await supabase.from("collections").select("id, name").eq("id", args.collection_id).single();
    if (error) {
      return textResult(error.code === "PGRST116" ? "Error: Collection not found" : `Error: ${error.message}`);
    }
    const { error: updateErr } = await supabase.from("collections").update({ ai_overview: args.overview, is_overview_stale: false }).eq("id", args.collection_id);
    if (updateErr) return textResult(`Error: ${updateErr.message}`);
    return textResult(JSON.stringify({
      success: true,
      collectionId: args.collection_id,
      name: collection.name,
      overviewTheme: args.overview.theme
    }, null, 2));
  }
  function decodeXMLEntities(str) {
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  }
  function extractXMLValue(block, tag) {
    const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
    const cdata = block.match(cdataRe);
    if (cdata) return cdata[1].trim();
    if (tag === "link") {
      const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*(?:\/>|>)/i);
      if (href) return href[1].trim();
    }
    const normalRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const normal = block.match(normalRe);
    if (normal) return decodeXMLEntities(normal[1].trim());
    return null;
  }
  function parseRSSFeed(xml) {
    const items = [];
    const itemRe = /<(?:item|entry)(?: [^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = extractXMLValue(block, "title") || "Untitled";
      const rawUrl = extractXMLValue(block, "link") || extractXMLValue(block, "id") || "";
      if (!rawUrl.startsWith("http")) continue;
      const url = rawUrl.replace(/^https?:\/\/nitter\.[^/]+/, "https://x.com");
      const pubStr = extractXMLValue(block, "pubDate") || extractXMLValue(block, "published") || extractXMLValue(block, "updated") || "";
      let publishedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        if (pubStr) publishedAt = new Date(pubStr).toISOString();
      } catch {
      }
      const author = extractXMLValue(block, "author") || extractXMLValue(block, "dc:creator") || "";
      items.push({ url, title, author, publishedAt });
    }
    return items;
  }
  async function fetchRSSFeed(feedUrl) {
    const resp = await fetch(feedUrl, {
      signal: AbortSignal.timeout(12e3),
      headers: {
        // Use browser UA — many RSS hosts (bearblog, Substack) block bot UAs
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/atom+xml, text/xml, */*"
      }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${feedUrl}`);
    return parseRSSFeed(await resp.text());
  }
  async function getSourceItems(source) {
    const since = source.last_checked_at ? new Date(source.last_checked_at) : /* @__PURE__ */ new Date(0);
    switch (source.source_type) {
      case "x_user": {
        throw new Error(`X/Twitter timeline scraping is unavailable \u2014 public nitter/RSS proxies are offline. To add @${source.handle} tweets, use fetch_content with individual tweet URLs.`);
      }
      case "rss": {
        const items = await fetchRSSFeed(source.handle);
        return items.filter((i) => new Date(i.publishedAt) > since);
      }
      case "youtube": {
        const channelId = source.handle.match(/UC[A-Za-z0-9_-]{21}[AQgw]/)?.[0] || source.handle;
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const items = await fetchRSSFeed(rssUrl);
        return items.filter((i) => new Date(i.publishedAt) > since);
      }
      default:
        return [];
    }
  }
  async function handleAddWatchedSource(args) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return textResult("Error: Not authenticated");
    const { data: existing } = await supabase.from("watched_sources").select("id, display_name").eq("user_id", user.id).eq("handle", args.handle).eq("active", true).maybeSingle();
    if (existing) return textResult(`Already watching "${existing.display_name}"`);
    const { data, error } = await supabase.from("watched_sources").insert({
      user_id: user.id,
      source_type: args.source_type,
      handle: args.handle,
      display_name: args.name || args.handle
      // null = never checked; first scrape will fetch whatever the feed currently contains
    }).select().single();
    if (error) return textResult(`Error: ${error.message}`);
    return textResult(JSON.stringify({
      success: true,
      id: data.id,
      message: `Now watching "${data.display_name}" (${data.source_type}). Call scrape_watched_sources to fetch new items.`
    }, null, 2));
  }
  async function handleListWatchedSources() {
    const { data, error } = await supabase.from("watched_sources").select("id, source_type, handle, display_name, last_checked_at, created_at").eq("active", true).order("created_at", { ascending: false });
    if (error) return textResult(`Error: ${error.message}`);
    if (!data || data.length === 0) return textResult("No watched sources yet. Use add_watched_source to add one.");
    return textResult(JSON.stringify(data, null, 2));
  }
  async function handleRemoveWatchedSource(args) {
    const { error } = await supabase.from("watched_sources").update({ active: false }).eq("id", args.id);
    if (error) return textResult(`Error: ${error.message}`);
    return textResult("Watched source removed.");
  }
  async function handleScrapeWatchedSources(args) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return textResult("Error: Not authenticated");
    let query = supabase.from("watched_sources").select("*").eq("active", true).eq("user_id", user.id);
    if (args.source_id) query = query.eq("id", args.source_id);
    const { data: sources, error } = await query;
    if (error) return textResult(`Error: ${error.message}`);
    if (!sources || sources.length === 0) {
      return textResult("No active watched sources. Use add_watched_source to add one.");
    }
    const countdownExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    const results = [];
    for (const source of sources) {
      let added = 0;
      let skipped = 0;
      try {
        const items = await getSourceItems(source);
        for (const item of items) {
          const { data: dupe } = await supabase.from("bookmarks").select("id").eq("url", item.url).maybeSingle();
          if (dupe) {
            skipped++;
            continue;
          }
          const { error: insertErr } = await supabase.from("bookmarks").insert({
            user_id: user.id,
            url: item.url,
            title: item.title,
            platform: detectPlatform(item.url),
            status: "active",
            countdown_expires_at: countdownExpiresAt,
            content_metadata: {
              author: item.author || source.display_name,
              watched_source_id: source.id,
              watched_source_name: source.display_name
            }
          });
          if (!insertErr) added++;
        }
        await supabase.from("watched_sources").update({ last_checked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", source.id);
        results.push({ source: source.display_name, type: source.source_type, added, skipped });
      } catch (err) {
        results.push({ source: source.display_name, type: source.source_type, error: err.message });
      }
    }
    const totalAdded = results.reduce((s, r) => s + (r.added || 0), 0);
    return textResult(JSON.stringify({ totalAdded, sources: results }, null, 2));
  }
  server.tool(
    "search_vault",
    "Search your Burn Vault for bookmarks by keyword (searches title, tags, AI takeaway)",
    { query: z.string().describe("Search keyword"), limit: z.number().optional().describe("Max results (default 10)") },
    rateLimited(handleSearchVault)
  );
  server.tool(
    "list_vault",
    "List bookmarks in your Vault, optionally filtered by category",
    { limit: z.number().optional().describe("Max results (default 20)"), category: z.string().optional().describe("Filter by vault category") },
    rateLimited(handleListVault)
  );
  server.tool(
    "list_sparks",
    "List your Sparks (bookmarks you have read, with 30-day lifespan). Includes spark insight and expiry date.",
    { limit: z.number().optional().describe("Max results (default 20)") },
    rateLimited(handleListSparks)
  );
  server.tool(
    "search_sparks",
    "Search your Sparks by keyword (searches title, tags, AI takeaway, spark insight)",
    { query: z.string().describe("Search keyword"), limit: z.number().optional().describe("Max results (default 10)") },
    rateLimited(handleSearchSparks)
  );
  server.tool(
    "get_bookmark",
    "Get full details of a single bookmark including AI analysis and extracted content",
    { id: z.string().describe("Bookmark UUID") },
    rateLimited(handleGetBookmark)
  );
  server.tool(
    "get_article_content",
    "Get full article content and AI analysis for a bookmark by ID (same as get_bookmark)",
    { id: z.string().describe("Bookmark UUID") },
    rateLimited(handleGetArticleContent)
  );
  server.tool(
    "fetch_content",
    "Fetch article/tweet content from a URL. Works with X.com (bypasses GFW via proxy), Reddit, YouTube, Bilibili, WeChat, and any web page. First checks Supabase cache, then fetches live.",
    { url: z.string().describe("The URL to fetch content from") },
    rateLimited(handleFetchContent)
  );
  server.tool(
    "list_categories",
    "List all Vault categories with article counts",
    {},
    rateLimited(handleListCategories)
  );
  server.tool(
    "list_flame",
    "List bookmarks in your Flame inbox (24h countdown). Shows AI triage info (strategy, relevance, novelty, hook) and time remaining. Use this to see what needs attention before it burns to Ash.",
    { limit: z.number().optional().describe("Max results (default 20)") },
    rateLimited(handleListFlame)
  );
  server.tool(
    "get_flame_detail",
    "Get full details of a Flame bookmark including extracted article content, AI analysis, and reading guidance. Use this to deep-read a bookmark before deciding its fate.",
    { id: z.string().describe("Bookmark UUID") },
    rateLimited(handleGetFlameDetail)
  );
  server.tool(
    "get_collections",
    "List all your Collections with article counts and AI overview themes",
    {},
    rateLimited(handleGetCollections)
  );
  server.tool(
    "get_collection_overview",
    "Get a Collection by name with its AI overview and linked bookmarks metadata",
    { name: z.string().describe("Collection name") },
    rateLimited(handleGetCollectionOverview)
  );
  server.tool(
    "move_flame_to_spark",
    "Move a Flame bookmark to Spark (mark as worth reading). Sets 30-day Spark lifespan.",
    {
      id: z.string().describe("Bookmark UUID"),
      spark_insight: z.string().max(500).optional().describe("One-line insight about why this is worth reading")
    },
    rateLimited(handleMoveFlameToSpark)
  );
  server.tool(
    "move_flame_to_ash",
    "Burn a Flame bookmark to Ash (not worth keeping).",
    {
      id: z.string().describe("Bookmark UUID"),
      reason: z.string().max(200).optional().describe("Why this was burned")
    },
    rateLimited(handleMoveFlameToAsh)
  );
  server.tool(
    "move_spark_to_vault",
    "Promote a Spark bookmark to permanent Vault storage.",
    {
      id: z.string().describe("Bookmark UUID"),
      vault_category: z.string().max(100).optional().describe("Category to file under in the Vault")
    },
    rateLimited(handleMoveSparkToVault)
  );
  server.tool(
    "move_spark_to_ash",
    "Burn a Spark bookmark to Ash (not valuable enough to vault).",
    {
      id: z.string().describe("Bookmark UUID")
    },
    rateLimited(handleMoveSparkToAsh)
  );
  server.tool(
    "batch_triage_flame",
    "Triage multiple Flame bookmarks at once. Each decision moves a bookmark to Spark or Ash.",
    {
      decisions: z.array(z.object({
        id: z.string().describe("Bookmark UUID"),
        action: z.enum(["spark", "ash"]).describe("spark = keep, ash = burn"),
        spark_insight: z.string().max(500).optional().describe("Insight (only for spark action)")
      })).min(1).max(20).describe("Array of triage decisions")
    },
    rateLimited(handleBatchTriageFlame)
  );
  server.tool(
    "write_bookmark_analysis",
    "Write AI analysis results into a bookmark. Agent analyzes content with its own LLM, then writes structured results back to Burn. Only provided fields are merged \u2014 existing data is preserved.",
    {
      id: z.string().describe("Bookmark UUID"),
      analysis: z.object({
        ai_summary: z.string().max(200).optional().describe("One-line summary"),
        ai_strategy: z.enum(["deep_read", "skim", "skip_read", "reference"]).optional().describe("Reading strategy"),
        ai_strategy_reason: z.string().max(200).optional().describe("Why this strategy"),
        ai_minutes: z.number().int().min(1).max(999).optional().describe("Estimated reading minutes"),
        ai_takeaway: z.array(z.string().max(200)).max(5).optional().describe("Key takeaways"),
        ai_relevance: z.number().int().min(0).max(100).optional().describe("Relevance score 0-100"),
        ai_novelty: z.number().int().min(0).max(100).optional().describe("Novelty score 0-100"),
        tags: z.array(z.string().max(50)).max(10).optional().describe("Topic tags")
      }).describe("Analysis fields to write")
    },
    rateLimited(handleWriteBookmarkAnalysis)
  );
  server.tool(
    "create_collection",
    "Create a new Collection to group related bookmarks together.",
    {
      name: z.string().min(1).max(200).describe("Collection name"),
      bookmark_ids: z.array(z.string()).optional().describe("Initial bookmark UUIDs to include")
    },
    rateLimited(handleCreateCollection)
  );
  server.tool(
    "add_to_collection",
    "Add bookmarks to an existing Collection. Duplicates are silently ignored.",
    {
      collection_id: z.string().describe("Collection UUID"),
      bookmark_ids: z.array(z.string()).min(1).max(50).describe("Bookmark UUIDs to add")
    },
    rateLimited(handleAddToCollection)
  );
  server.tool(
    "remove_from_collection",
    "Remove bookmarks from a Collection.",
    {
      collection_id: z.string().describe("Collection UUID"),
      bookmark_ids: z.array(z.string()).min(1).describe("Bookmark UUIDs to remove")
    },
    rateLimited(handleRemoveFromCollection)
  );
  server.tool(
    "update_collection_overview",
    "Write an AI-generated overview for a Collection (theme, synthesis, patterns, gaps).",
    {
      collection_id: z.string().describe("Collection UUID"),
      overview: z.object({
        theme: z.string().describe("Overarching theme"),
        synthesis: z.string().optional().describe("Cross-bookmark synthesis"),
        patterns: z.array(z.string()).optional().describe("Patterns identified"),
        gaps: z.array(z.string()).optional().describe("Knowledge gaps identified")
      }).describe("AI-generated overview")
    },
    rateLimited(handleUpdateCollectionOverview)
  );
  server.tool(
    "add_watched_source",
    "Watch an X user, RSS feed, or YouTube channel \u2014 new posts auto-appear in Burn Flame on each scrape.",
    {
      source_type: z.enum(["x_user", "rss", "youtube"]).describe("x_user = Twitter/X handle | rss = any RSS/Atom feed URL | youtube = YouTube channel ID"),
      handle: z.string().describe('x_user: username without @ (e.g. "karpathy") | rss: full feed URL | youtube: channel ID starting with UC'),
      name: z.string().optional().describe("Human-friendly display name (defaults to handle)")
    },
    rateLimited(handleAddWatchedSource)
  );
  server.tool(
    "list_watched_sources",
    "List all active watched sources (X users, RSS feeds, YouTube channels).",
    {},
    rateLimited(handleListWatchedSources)
  );
  server.tool(
    "remove_watched_source",
    "Stop watching a source. Use list_watched_sources to find the source ID.",
    { id: z.string().describe("Watched source UUID from list_watched_sources") },
    rateLimited(handleRemoveWatchedSource)
  );
  server.tool(
    "scrape_watched_sources",
    "Fetch new content from all watched sources (or one specific source) and add new items to Burn Flame. Call this on a schedule or on demand.",
    { source_id: z.string().optional().describe("Scrape only this source ID \u2014 omit to scrape all active sources") },
    rateLimited(handleScrapeWatchedSources)
  );
  server.resource(
    "vault-bookmarks",
    "burn://vault/bookmarks",
    async (uri) => {
      const { data, error } = await supabase.from("bookmarks").select("*").eq("status", "absorbed").order("created_at", { ascending: false });
      if (error) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: error.message }) }] };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify((data || []).map(metaSummary), null, 2)
        }]
      };
    }
  );
  server.resource(
    "vault-categories",
    "burn://vault/categories",
    async (uri) => {
      const { data, error } = await supabase.from("bookmarks").select("content_metadata").eq("status", "absorbed");
      if (error) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: error.message }) }] };
      }
      const counts = {};
      for (const row of data || []) {
        const cat = row.content_metadata?.vault_category || "Uncategorized";
        counts[cat] = (counts[cat] || 0) + 1;
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            Object.entries(counts).map(([category, count]) => ({ category, count })),
            null,
            2
          )
        }]
      };
    }
  );
  return server;
}

// src/http.ts
var SUPABASE_URL = process.env.BURN_SUPABASE_URL || "https://juqtxylquemiuvvmgbej.supabase.co";
var SUPABASE_ANON_KEY = process.env.BURN_SUPABASE_ANON_KEY || "sb_publishable_reVgmmCC6ndIo6jFRMM2LQ_wujj5FrO";
async function handleMcpRequest(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    return new Response(JSON.stringify({
      error: "Missing Authorization header",
      hint: "Add `Authorization: Bearer <BURN_MCP_TOKEN>` header. Get your token at https://burn451.cloud \u2192 Settings \u2192 MCP Server."
    }), { status: 401, headers: { "content-type": "application/json" } });
  }
  let session;
  try {
    session = await getOrExchangeSession(token);
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Invalid or expired Burn MCP token",
      detail: String(e?.message || e)
    }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${session.access_token}` }
    }
  });
  const server = createBurnServer(supabase, { rateLimitPerMin: 60 });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: void 0,
    // stateless mode — MCP SDK treats each request as a new conversation
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// src/vercel-handler.ts
var config = { runtime: "edge" };
async function handler(req) {
  try {
    return await handleMcpRequest(req);
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Handler threw",
      message: String(e?.message || e),
      stack: String(e?.stack || "").slice(0, 2e3)
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
export {
  config,
  handler as default
};
