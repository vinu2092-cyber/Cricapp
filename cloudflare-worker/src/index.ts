/**
 * CricApp Cloudflare Worker — Edge Cache + RapidAPI Proxy
 *
 * Goal: Reduce 10,000 user calls → ~100 RapidAPI calls per day via edge caching.
 *
 * Architecture (3-tier cache):
 *   1. Cloudflare Cache API (edge, 330+ POPs, FREE, ~99% of traffic served here)
 *   2. globalThis in-memory (warm V8 isolate, 5-15 min reuse)
 *   3. Origin fetch from RapidAPI with key rotation + failover
 *
 * Endpoints (all under /api/v1/cricbuzz/* — path mirrors RapidAPI path):
 *   GET /api/v1/cricbuzz/matches/v1/live
 *   GET /api/v1/cricbuzz/matches/v1/recent
 *   GET /api/v1/cricbuzz/matches/v1/upcoming
 *   GET /api/v1/cricbuzz/mcenter/v1/:id
 *   GET /api/v1/cricbuzz/mcenter/v1/:id/comm
 *   GET /api/v1/cricbuzz/mcenter/v1/:id/scard
 *   GET /api/v1/cricbuzz/mcenter/v1/:id/team/:teamId
 *
 *   GET /api/v1/version       — { latest_version, min_supported_version, play_store_url }
 *   GET /api/v1/health        — { ok: true, ts }
 *
 * Optional ?host=host2 query switches to Host 2 (cricbuzz-cricket2). Default = Host 1.
 */

export interface Env {
  // Secrets (set via `wrangler secret put`)
  CRICBUZZ_KEYS_HOST1: string;  // comma-separated RapidAPI keys for Host 1
  CRICBUZZ_KEYS_HOST2: string;  // comma-separated RapidAPI keys for Host 2

  // Vars (from wrangler.toml)
  CACHE_TTL_LIVE: string;
  CACHE_TTL_RECENT: string;
  CACHE_TTL_UPCOMING: string;
  CACHE_TTL_DETAIL: string;
  CACHE_TTL_COMM: string;
  CACHE_TTL_SCARD: string;
  CACHE_TTL_TEAM: string;
  LATEST_VERSION: string;
  MIN_SUPPORTED_VERSION: string;
  PLAY_STORE_URL: string;
  ALLOWED_ORIGIN: string;
  HOST_1: string;
  HOST_2: string;
  RATE_LIMIT_PER_MIN: string;
}

// ============ In-memory rate limiter (per IP, per minute) ============
const rateBuckets: Map<string, { count: number; resetAt: number }> = (globalThis as any).__rateBuckets || new Map();
(globalThis as any).__rateBuckets = rateBuckets;

function rateLimitCheck(ip: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  bucket.count++;
  if (bucket.count > limit) return false;
  return true;
}

// Cleanup old buckets occasionally
let lastCleanup = 0;
function maybeCleanupBuckets() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of rateBuckets.entries()) {
    if (v.resetAt < now) rateBuckets.delete(k);
  }
}

// ============ CORS ============
function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CricApp-Version',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body: any, status: number, origin: string, cacheControl?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin) as Record<string, string>,
  };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  return new Response(JSON.stringify(body), { status, headers });
}

// ============ Endpoint TTL mapping ============
function getTTL(env: Env, pathname: string): number {
  if (pathname.endsWith('/matches/v1/live')) return parseInt(env.CACHE_TTL_LIVE, 10);
  if (pathname.endsWith('/matches/v1/recent')) return parseInt(env.CACHE_TTL_RECENT, 10);
  if (pathname.endsWith('/matches/v1/upcoming')) return parseInt(env.CACHE_TTL_UPCOMING, 10);
  if (pathname.includes('/comm')) return parseInt(env.CACHE_TTL_COMM, 10);
  if (pathname.includes('/scard')) return parseInt(env.CACHE_TTL_SCARD, 10);
  if (pathname.includes('/team/')) return parseInt(env.CACHE_TTL_TEAM, 10);
  if (pathname.includes('/mcenter/v1/')) return parseInt(env.CACHE_TTL_DETAIL, 10);
  return 30;
}

// ============ Origin fetch with key rotation ============
async function fetchFromOrigin(
  rapidPath: string,
  searchParams: string,
  host: string,
  keys: string[]
): Promise<{ ok: boolean; status: number; body: any }> {
  if (!keys.length) return { ok: false, status: 503, body: { error: 'no_keys_configured' } };

  // Try each key sequentially until one succeeds (429 / 403 → next key)
  for (const key of keys) {
    const url = `https://${host}${rapidPath}${searchParams ? '?' + searchParams : ''}`;
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': key,
          'X-RapidAPI-Host': host,
          'Accept': 'application/json',
        },
        cf: { cacheTtl: 0, cacheEverything: false } as any,
      });
      if (r.status === 429 || r.status === 403) {
        // rate-limited / not subscribed — try next key
        continue;
      }
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        return { ok: true, status: 200, body };
      }
      // Other non-OK — return as-is
      const body = await r.json().catch(() => ({ error: 'origin_error', status: r.status }));
      return { ok: false, status: r.status, body };
    } catch (e: any) {
      // Network error — try next key
      continue;
    }
  }
  return { ok: false, status: 502, body: { error: 'all_keys_exhausted' } };
}

// ============ Layer 2: globalThis warm cache ============
interface MemCacheEntry { data: any; expiresAt: number; }
const memCache: Map<string, MemCacheEntry> = (globalThis as any).__memCache || new Map();
(globalThis as any).__memCache = memCache;

function memGet(key: string): any | null {
  const e = memCache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) { memCache.delete(key); return null; }
  return e.data;
}
function memSet(key: string, data: any, ttlSec: number) {
  memCache.set(key, { data, expiresAt: Date.now() + ttlSec * 1000 });
  // Keep memory bounded
  if (memCache.size > 500) {
    const firstKey = memCache.keys().next().value;
    if (firstKey) memCache.delete(firstKey);
  }
}

// ============ MAIN HANDLER ============
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
    }

    // ===== Built-in routes =====
    if (url.pathname === '/' || url.pathname === '/api/v1/health') {
      return jsonResponse({ ok: true, service: 'cricapp-proxy', ts: Date.now() }, 200, origin, 'no-store');
    }
    if (url.pathname === '/api/v1/version') {
      return jsonResponse({
        latest_version: env.LATEST_VERSION,
        min_supported_version: env.MIN_SUPPORTED_VERSION,
        play_store_url: env.PLAY_STORE_URL,
        ts: Date.now(),
      }, 200, origin, 'public, max-age=300');
    }

    // ===== Proxy routes: /api/v1/cricbuzz/<rapid-path> =====
    const PROXY_PREFIX = '/api/v1/cricbuzz';
    if (!url.pathname.startsWith(PROXY_PREFIX)) {
      return jsonResponse({ error: 'not_found', path: url.pathname }, 404, origin);
    }
    const rapidPath = url.pathname.slice(PROXY_PREFIX.length) || '/';
    const ttl = getTTL(env, url.pathname);

    // Strip ?host before forwarding to RapidAPI
    const sp = new URLSearchParams(url.search);
    const hostChoice = sp.get('host');
    sp.delete('host');
    const forwardSearch = sp.toString();

    const host = hostChoice === 'host2' ? env.HOST_2 : env.HOST_1;
    const keys = hostChoice === 'host2'
      ? (env.CRICBUZZ_KEYS_HOST2 || '').split(',').map(s => s.trim()).filter(Boolean)
      : (env.CRICBUZZ_KEYS_HOST1 || '').split(',').map(s => s.trim()).filter(Boolean);

    const cacheKey = `${host}${rapidPath}?${forwardSearch}`;

    // ===== Rate limit per IP (after cache so cache hits are unlimited) =====
    // Note: we check rate limit AFTER cache hit (cheap edge serve doesn't consume budget)
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rateLimit = parseInt(env.RATE_LIMIT_PER_MIN, 10) || 120;

    // ===== Layer 1: Cloudflare Cache API =====
    const cache = (caches as any).default;
    const cacheReq = new Request(`https://cache.local/${cacheKey}`, { method: 'GET' });
    let cached = await cache.match(cacheReq);
    if (cached) {
      const body = await cached.json();
      return jsonResponse({ data: body, source: 'edge_cache', host }, 200, origin, `public, max-age=${ttl}`);
    }

    // ===== Layer 2: globalThis warm cache =====
    const warm = memGet(cacheKey);
    if (warm) {
      return jsonResponse({ data: warm, source: 'warm_memory', host }, 200, origin, `public, max-age=${Math.max(5, ttl - 10)}`);
    }

    // ===== Rate limit check before hitting origin (only counts cache MISS traffic) =====
    if (!rateLimitCheck(ip, rateLimit)) {
      return jsonResponse({ error: 'rate_limited', retry_after_seconds: 60 }, 429, origin, 'no-store');
    }
    maybeCleanupBuckets();

    // ===== Layer 3: Origin fetch =====
    const result = await fetchFromOrigin(rapidPath, forwardSearch, host, keys);
    if (!result.ok) {
      return jsonResponse({ error: 'origin_failed', status: result.status, detail: result.body }, result.status, origin, 'no-store');
    }

    // Save to both caches
    memSet(cacheKey, result.body, ttl);
    const cacheResponse = new Response(JSON.stringify(result.body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    });
    try { await cache.put(cacheReq, cacheResponse.clone()); } catch (_) { /* cache.put best-effort */ }

    return jsonResponse({ data: result.body, source: 'origin', host }, 200, origin, `public, max-age=${ttl}`);
  },
};
