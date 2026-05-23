/**
 * CricApp Cloudflare Worker — Edge Cache + RapidAPI Proxy
 *
 * Goal: Reduce 50,000 user calls → ~2-3 RapidAPI calls per minute via edge caching.
 *
 * KEY FEATURE: Reads API keys from Firebase dynamically!
 *   - You update keys in Firebase → Worker uses new keys automatically
 *   - No need to redeploy worker when keys change
 *   - Keys cached for 5 minutes to reduce Firebase reads
 *
 * Architecture (3-tier cache):
 *   1. Cloudflare Cache API (edge, 330+ POPs, FREE, ~99% of traffic served here)
 *   2. globalThis in-memory (warm V8 isolate, 5-15 min reuse)
 *   3. Origin fetch from RapidAPI with key rotation + failover
 *
 * Endpoints:
 *   GET /api/v1/cricbuzz/*     — Proxy to RapidAPI with 25s cache
 *   GET /api/v1/version        — { latest_version, min_supported_version }
 *   GET /api/v1/health         — { ok: true, ts }
 */

export interface Env {
  // Firebase config (from wrangler.toml vars)
  FIREBASE_DB_URL: string;       // e.g. "https://your-project.firebaseio.com"
  FIREBASE_KEYS_PATH: string;    // e.g. "/app_config/api_keys" 
  
  // Vars (from wrangler.toml)
  CACHE_TTL: string;             // 25 seconds for all endpoints
  LATEST_VERSION: string;
  MIN_SUPPORTED_VERSION: string;
  PLAY_STORE_URL: string;
  ALLOWED_ORIGIN: string;
  HOST_1: string;
  HOST_2: string;
  RATE_LIMIT_PER_MIN: string;
}

// ============ Dynamic Keys from Firebase (cached 5 min) ============
interface KeysCache {
  host1Keys: string[];
  host2Keys: string[];
  fetchedAt: number;
}
const KEYS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let keysCache: KeysCache | null = (globalThis as any).__keysCache || null;
(globalThis as any).__keysCache = keysCache;

async function getKeysFromFirebase(env: Env): Promise<KeysCache> {
  // Return cached if fresh
  if (keysCache && Date.now() - keysCache.fetchedAt < KEYS_CACHE_TTL) {
    return keysCache;
  }

  try {
    // Fetch from Firebase RTDB (public read assumed, or add auth token if needed)
    const url = `${env.FIREBASE_DB_URL}${env.FIREBASE_KEYS_PATH}.json`;
    const res = await fetch(url, { 
      cf: { cacheTtl: 0, cacheEverything: false } as any 
    });
    
    if (!res.ok) {
      console.error('Firebase fetch failed:', res.status);
      // Return old cache if available, else empty
      return keysCache || { host1Keys: [], host2Keys: [], fetchedAt: Date.now() };
    }

    const data = await res.json();
    
    // Parse keys from Firebase structure
    // Expected structure: { api_key: "key1", api_key_p2: "key2", host2_key: "key3", ... }
    // Or array: { keys_host1: ["k1","k2"], keys_host2: ["k3","k4"] }
    const host1Keys: string[] = [];
    const host2Keys: string[] = [];

    if (data) {
      // Support multiple formats:
      // Format 1: { api_key, api_key_p2, api_key_p3, ... }
      // Format 2: { keys_host1: [...], keys_host2: [...] }
      // Format 3: { host1: { key1: "...", key2: "..." }, host2: { ... } }
      
      if (Array.isArray(data.keys_host1)) {
        host1Keys.push(...data.keys_host1.filter(Boolean));
      }
      if (Array.isArray(data.keys_host2)) {
        host2Keys.push(...data.keys_host2.filter(Boolean));
      }
      
      // Also check for individual key fields
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string' && v.trim()) {
          if (k.includes('host2') || k.includes('HOST2') || k.includes('_h2')) {
            host2Keys.push(v.trim());
          } else if (k.includes('api_key') || k.includes('API_KEY') || k.includes('key') || k.includes('host1')) {
            host1Keys.push(v.trim());
          }
        }
      }
    }

    keysCache = { host1Keys, host2Keys, fetchedAt: Date.now() };
    (globalThis as any).__keysCache = keysCache;
    
    console.log(`Loaded ${host1Keys.length} host1 keys, ${host2Keys.length} host2 keys from Firebase`);
    return keysCache;
  } catch (e) {
    console.error('Firebase keys fetch error:', e);
    return keysCache || { host1Keys: [], host2Keys: [], fetchedAt: Date.now() };
  }
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

// ============ Single 25-second TTL for all endpoints ============
function getTTL(env: Env): number {
  return parseInt(env.CACHE_TTL, 10) || 25;
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

    // ===== Proxy routes =====
    const PROXY_PREFIX = '/api/v1/cricbuzz';
    let rapidPath: string;
    if (url.pathname.startsWith(PROXY_PREFIX)) {
      rapidPath = url.pathname.slice(PROXY_PREFIX.length) || '/';
    } else if (
      url.pathname.startsWith('/matches/') ||
      url.pathname.startsWith('/mcenter/') ||
      url.pathname.startsWith('/series/') ||
      url.pathname.startsWith('/teams/') ||
      url.pathname.startsWith('/players/') ||
      url.pathname.startsWith('/stats/') ||
      url.pathname.startsWith('/photos/') ||
      url.pathname.startsWith('/news/') ||
      url.pathname.startsWith('/schedule/') ||
      url.pathname.startsWith('/venues/')
    ) {
      // Legacy path support for old app versions
      rapidPath = url.pathname;
    } else {
      return jsonResponse({ error: 'not_found', path: url.pathname }, 404, origin);
    }
    
    const ttl = getTTL(env);  // 25 seconds

    // Strip ?host before forwarding to RapidAPI
    const sp = new URLSearchParams(url.search);
    const hostChoice = sp.get('host');
    sp.delete('host');
    const forwardSearch = sp.toString();

    const host = hostChoice === 'host2' ? env.HOST_2 : env.HOST_1;
    
    // ===== GET KEYS FROM FIREBASE (cached 5 min) =====
    const firebaseKeys = await getKeysFromFirebase(env);
    const keys = hostChoice === 'host2' ? firebaseKeys.host2Keys : firebaseKeys.host1Keys;

    const cacheKey = `${host}${rapidPath}?${forwardSearch}`;

    // ===== Rate limit per IP =====
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

    // ===== Rate limit check before hitting origin =====
    if (!rateLimitCheck(ip, rateLimit)) {
      return jsonResponse({ error: 'rate_limited', retry_after_seconds: 60 }, 429, origin, 'no-store');
    }
    maybeCleanupBuckets();

    // ===== Layer 3: Origin fetch with Firebase keys =====
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
