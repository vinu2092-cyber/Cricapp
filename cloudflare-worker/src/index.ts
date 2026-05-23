/**
 * CricApp Cloudflare Worker — Edge Cache + RapidAPI Proxy
 * PRODUCTION READY v1.0.19
 *
 * Features:
 * - 25-second cache (2-3 API calls/min instead of 50,000)
 * - Secure Cloud Firestore fetch with secret verification
 * - Keys cached 5 min — update in Firestore, worker auto-picks new keys
 */

export interface Env {
  FIRESTORE_URL: string;
  FIREBASE_SECRET: string;
  CACHE_TTL: string;
  LATEST_VERSION: string;
  MIN_SUPPORTED_VERSION: string;
  PLAY_STORE_URL: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_PER_MIN: string;
}

// ============ Firestore Keys Cache (5 min) ============
interface KeysCache {
  apiHost: string;
  apiHostP2: string;
  apiKeys: string[];
  apiKeysP2: string[];
  currentProvider: string;
  fetchedAt: number;
}
const KEYS_CACHE_TTL = 5 * 60 * 1000;
let keysCache: KeysCache | null = (globalThis as any).__keysCache || null;
(globalThis as any).__keysCache = keysCache;

function parseKeys(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(k => k.replace(/\s+/g, '')).filter(k => k.length > 10);
}

async function getKeysFromFirestore(env: Env): Promise<KeysCache> {
  if (keysCache && Date.now() - keysCache.fetchedAt < KEYS_CACHE_TTL) {
    return keysCache;
  }

  try {
    // Cloud Firestore REST API fetch
    const res = await fetch(env.FIRESTORE_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cf: { cacheTtl: 0, cacheEverything: false } as any,
    });

    if (!res.ok) {
      console.error('Firestore fetch failed:', res.status);
      return keysCache || emptyCache();
    }

    const json = await res.json() as any;
    const fields = json?.fields;

    if (!fields) {
      console.error('No fields in Firestore response');
      return keysCache || emptyCache();
    }

    // Verify secret field matches
    const secretInDoc = fields?.secret?.stringValue || '';
    if (secretInDoc !== env.FIREBASE_SECRET) {
      console.error('Secret mismatch - access denied');
      return keysCache || emptyCache();
    }

    // Parse Firestore document structure:
    // fields.api_host.stringValue, fields.api_key.stringValue, etc.
    const apiHost = (fields?.api_host?.stringValue || 'cricbuzz-cricket.p.rapidapi.com').replace(/\s+/g, '');
    const apiHostP2 = (fields?.api_host_p2?.stringValue || 'cricbuzz-cricket2.p.rapidapi.com').replace(/\s+/g, '');
    const apiKeysRaw = fields?.api_key?.stringValue || '';
    const apiKeysP2Raw = fields?.api_key_p2?.stringValue || '';
    const currentProvider = (fields?.current_provider?.stringValue || 'cricbuzz-cricket').replace(/\s+/g, '');

    keysCache = {
      apiHost,
      apiHostP2,
      apiKeys: parseKeys(apiKeysRaw),
      apiKeysP2: parseKeys(apiKeysP2Raw),
      currentProvider,
      fetchedAt: Date.now(),
    };
    (globalThis as any).__keysCache = keysCache;

    console.log(`Firestore: ${keysCache.apiKeys.length} host1 keys, ${keysCache.apiKeysP2.length} host2 keys`);
    return keysCache;
  } catch (e: any) {
    console.error('Firestore error:', e?.message);
    return keysCache || emptyCache();
  }
}

function emptyCache(): KeysCache {
  return {
    apiHost: 'cricbuzz-cricket.p.rapidapi.com',
    apiHostP2: 'cricbuzz-cricket2.p.rapidapi.com',
    apiKeys: [],
    apiKeysP2: [],
    currentProvider: 'cricbuzz-cricket',
    fetchedAt: Date.now(),
  };
}

// ============ Rate Limiter ============
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
  return bucket.count <= limit;
}

function maybeCleanupBuckets() {
  const now = Date.now();
  for (const [k, v] of rateBuckets.entries()) {
    if (v.resetAt < now) rateBuckets.delete(k);
  }
}

// ============ Memory Cache ============
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
  if (memCache.size > 500) {
    const firstKey = memCache.keys().next().value;
    if (firstKey) memCache.delete(firstKey);
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

// ============ RapidAPI Fetch ============
async function fetchFromOrigin(
  rapidPath: string,
  searchParams: string,
  host: string,
  keys: string[]
): Promise<{ ok: boolean; status: number; body: any }> {
  if (!keys.length) return { ok: false, status: 503, body: { error: 'no_keys_configured' } };

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
        console.log(`Key ${key.substring(0, 12)}... got ${r.status} - next`);
        continue;
      }
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        return { ok: true, status: 200, body };
      }
      const body = await r.json().catch(() => ({ error: 'origin_error', status: r.status }));
      return { ok: false, status: r.status, body };
    } catch (e: any) {
      continue;
    }
  }
  return { ok: false, status: 502, body: { error: 'all_keys_exhausted' } };
}

// ============ MAIN HANDLER ============
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);
    const ttl = parseInt(env.CACHE_TTL, 10) || 25;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
    }

    // Health
    if (url.pathname === '/' || url.pathname === '/api/v1/health') {
      return jsonResponse({ ok: true, service: 'cricapp-proxy', ts: Date.now() }, 200, origin, 'no-store');
    }

    // Version
    if (url.pathname === '/api/v1/version') {
      return jsonResponse({
        latest_version: env.LATEST_VERSION,
        min_supported_version: env.MIN_SUPPORTED_VERSION,
        play_store_url: env.PLAY_STORE_URL,
        ts: Date.now(),
      }, 200, origin, 'public, max-age=300');
    }

    // Proxy routes
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
      url.pathname.startsWith('/schedule/')
    ) {
      rapidPath = url.pathname;
    } else {
      return jsonResponse({ error: 'not_found', path: url.pathname }, 404, origin);
    }

    const sp = new URLSearchParams(url.search);
    const hostChoice = sp.get('host');
    sp.delete('host');
    const forwardSearch = sp.toString();

    // Get keys from Cloud Firestore
    const config = await getKeysFromFirestore(env);
    const host = hostChoice === 'host2' ? config.apiHostP2 : config.apiHost;
    const keys = hostChoice === 'host2' ? config.apiKeysP2 : config.apiKeys;

    const cacheKey = `${host}${rapidPath}?${forwardSearch}`;

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rateLimit = parseInt(env.RATE_LIMIT_PER_MIN, 10) || 120;

    // Layer 1: Edge Cache
    const cache = (caches as any).default;
    const cacheReq = new Request(`https://cache.local/${cacheKey}`, { method: 'GET' });
    const cached = await cache.match(cacheReq);
    if (cached) {
      const body = await cached.json();
      return jsonResponse({ data: body, source: 'edge_cache', host }, 200, origin, `public, max-age=${ttl}`);
    }

    // Layer 2: Memory Cache
    const warm = memGet(cacheKey);
    if (warm) {
      return jsonResponse({ data: warm, source: 'warm_memory', host }, 200, origin, `public, max-age=${Math.max(5, ttl - 10)}`);
    }

    // Rate limit
    if (!rateLimitCheck(ip, rateLimit)) {
      return jsonResponse({ error: 'rate_limited', retry_after_seconds: 60 }, 429, origin, 'no-store');
    }
    maybeCleanupBuckets();

    // Layer 3: Origin
    const result = await fetchFromOrigin(rapidPath, forwardSearch, host, keys);
    if (!result.ok) {
      // Try alternate host
      const altHost = host === config.apiHost ? config.apiHostP2 : config.apiHost;
      const altKeys = host === config.apiHost ? config.apiKeysP2 : config.apiKeys;
      if (altKeys.length > 0) {
        const altResult = await fetchFromOrigin(rapidPath, forwardSearch, altHost, altKeys);
        if (altResult.ok) {
          memSet(cacheKey, altResult.body, ttl);
          const cacheResponse = new Response(JSON.stringify(altResult.body), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
          });
          try { await cache.put(cacheReq, cacheResponse.clone()); } catch (_) {}
          return jsonResponse({ data: altResult.body, source: 'origin', host: altHost }, 200, origin, `public, max-age=${ttl}`);
        }
      }
      return jsonResponse({ error: 'origin_failed', status: result.status, detail: result.body }, result.status, origin, 'no-store');
    }

    memSet(cacheKey, result.body, ttl);
    const cacheResponse = new Response(JSON.stringify(result.body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    });
    try { await cache.put(cacheReq, cacheResponse.clone()); } catch (_) {}

    return jsonResponse({ data: result.body, source: 'origin', host }, 200, origin, `public, max-age=${ttl}`);
  },
};
