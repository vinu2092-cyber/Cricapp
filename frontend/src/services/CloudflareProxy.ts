/**
 * CloudflareProxy.ts
 *
 * Lightweight wrapper that tries to fetch cricket data through our Cloudflare
 * Worker edge cache first (cricapp-proxy.<subdomain>.workers.dev).
 *
 * Why?  10,000 users hitting the same endpoint = 10,000 RapidAPI calls.
 * With the worker in front, those become 1 RapidAPI call + 9,999 free edge
 * cache hits. Saves RapidAPI quota by ~99% — the entire point of this layer.
 *
 * SAFETY GUARANTEES:
 *   1. If Cloudflare URL is not configured (Firestore field empty) → returns
 *      null immediately. Caller falls back to direct RapidAPI path.
 *   2. If worker is down, slow, or returns non-2xx → returns null. Caller
 *      falls back. App NEVER crashes due to Cloudflare being unavailable.
 *   3. 5-second hard timeout. If worker doesn't respond in 5s, we give up
 *      and use the direct RapidAPI path so user never sees a stuck spinner.
 *   4. Old app versions (1.0.17 and below) don't import this module at all,
 *      so existing users on Play Store are completely unaffected.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRESTORE_PROJECT = 'cricapp-2092';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/app_config/settings`;
const URL_CACHE_KEY = 'cricapp_cloudflare_proxy_url';
const URL_CACHE_TS_KEY = 'cricapp_cloudflare_proxy_url_ts';
const URL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5000;

let cachedProxyUrl: string | null = null;
let proxyDisabled = false; // becomes true after repeated failures so we stop retrying
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 4; // after 4 in-a-row failures, disable for this session

/**
 * Reads cloudflare_proxy_url from Firestore (cached locally for 1 hour).
 * Returns null if not configured or fetch fails.
 */
async function fetchCloudflareUrlFromFirestore(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(FIRESTORE_URL, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json: any = await res.json();
    const raw = json?.fields?.cloudflare_proxy_url?.stringValue;
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim().replace(/\/+$/g, '');
    if (!trimmed.startsWith('https://')) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export async function getCloudflareProxyUrl(): Promise<string | null> {
  if (proxyDisabled) return null;
  if (cachedProxyUrl !== null) return cachedProxyUrl || null;

  // Try local cache first
  try {
    const [stored, tsRaw] = await Promise.all([
      AsyncStorage.getItem(URL_CACHE_KEY),
      AsyncStorage.getItem(URL_CACHE_TS_KEY),
    ]);
    const ts = tsRaw ? parseInt(tsRaw, 10) : 0;
    if (stored && ts && Date.now() - ts < URL_CACHE_TTL_MS) {
      cachedProxyUrl = stored || '';
      return cachedProxyUrl || null;
    }
  } catch {}

  // Refresh from Firestore
  const fresh = await fetchCloudflareUrlFromFirestore();
  if (fresh) {
    cachedProxyUrl = fresh;
    try {
      await AsyncStorage.setItem(URL_CACHE_KEY, fresh);
      await AsyncStorage.setItem(URL_CACHE_TS_KEY, String(Date.now()));
    } catch {}
    return fresh;
  }

  cachedProxyUrl = '';
  return null;
}

/**
 * Fetch cricket data through Cloudflare Worker.
 * Returns parsed body on success, null on any failure (caller falls back).
 *
 * @param endpoint  Path relative to RapidAPI host (e.g. "/matches/v1/live")
 * @param params    Query string params to forward
 * @param hostChoice 'host1' (default) or 'host2'
 */
export async function fetchViaCloudflare(
  endpoint: string,
  params?: Record<string, string>,
  hostChoice: 'host1' | 'host2' = 'host1'
): Promise<any | null> {
  if (proxyDisabled) return null;

  const baseUrl = await getCloudflareProxyUrl();
  if (!baseUrl) return null;

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const sp = new URLSearchParams(params || {});
  if (hostChoice === 'host2') sp.set('host', 'host2');
  const qs = sp.toString();
  const fullUrl = `${baseUrl}/api/v1/cricbuzz${cleanEndpoint}${qs ? `?${qs}` : ''}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        proxyDisabled = true;
        console.log('[CloudflareProxy] Disabled for session after repeated failures');
      }
      return null;
    }
    const body: any = await res.json();
    if (!body || body.error) {
      consecutiveFailures++;
      return null;
    }
    consecutiveFailures = 0; // reset on success
    // Worker wraps payload under .data — unwrap for caller compatibility
    return body.data !== undefined ? body.data : body;
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      proxyDisabled = true;
      console.log('[CloudflareProxy] Disabled for session after repeated failures');
    }
    return null;
  }
}

export function resetCloudflareProxyState() {
  cachedProxyUrl = null;
  proxyDisabled = false;
  consecutiveFailures = 0;
}
