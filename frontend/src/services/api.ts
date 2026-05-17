import axios from 'axios';
import { Match, Commentary } from '../types/match';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ FIREBASE - SAFE LAZY LOAD ============
let _getFirebaseKey: (() => { apiKey: string; apiHost: string; provider: string } | null) | null = null;
let _waitForFirebaseKey: ((timeoutMs?: number) => Promise<{ apiKey: string; apiHost: string; provider: string } | null>) | null = null;
let _getAllProviders: (() => Array<{ name: string; host: string; keys: string[] }>) | null = null;
let _markKeyFailed: ((key: string) => void) | null = null;
let _getDebugLog: (() => string[]) | null = null;

try {
  const fb = require('./FirebaseKeyService');
  fb.initFirebaseKeyFetch();
  _getFirebaseKey = fb.getFirebaseKey;
  _waitForFirebaseKey = fb.waitForFirebaseKey;
  _getAllProviders = fb.getAllProviders;
  _markKeyFailed = fb.markKeyFailed;
  _getDebugLog = fb.getDebugLog;
  console.log('[API] Firebase module loaded successfully');
} catch (e: any) {
  console.warn('[API] Firebase module FAILED to load:', e?.message || e);
  _getFirebaseKey = null;
  _waitForFirebaseKey = null;
}

// ============ API KEY MANAGEMENT ============
const API_KEY_STORAGE = 'cricapp_user_api_key';

// ---- Provider 1: cricbuzz-cricket (Primary) ----
const HOST_1 = "cricbuzz-cricket.p.rapidapi.com";

// ---- Provider 2: cricbuzz-cricket2 ----
const HOST_2 = "cricbuzz-cricket2.p.rapidapi.com";

// NOTE: Host 3 (cricbuzz-real-time-cricket-api) was REMOVED on 2026-04-18 —
// that provider's API does not serve per-match detail / commentary /
// scorecard / squads endpoints (only listings), so it cannot power the
// full app. Firestore `api_host_p3` / `api_key_p3` are now ignored.

// Hardcoded keys REMOVED — app now relies on Firebase Remote Config for API credentials
// If Firebase is unavailable, the app shows a "Syncing..." state
const COMM_KEYS: string[] = [];
const MATCH_KEYS: string[] = [];

// Get user's custom API key (if set)
async function getUserApiKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(API_KEY_STORAGE);
  } catch {
    return null;
  }
}

// ============ PROVIDER FACTORY PATTERN ============
// Each provider defines its own endpoint paths and response parsers.
// Switch provider from Firebase without updating the app.

interface ProviderConfig {
  host: string;
  endpoints: {
    live: string;
    recent: string;
    upcoming: string;
    matchDetail: (id: string) => string;
    commentary: (id: string) => string;
    scorecard: (id: string) => string;
    teamSquad: (id: string, teamId: string) => string;
  };
  /**
   * Endpoint types NOT supported by this provider. The fetch loop will skip
   * this provider's keys for these endpoint types and try the next provider.
   * Example: cricbuzz-real-time-cricket-api (Host 3) exposes only match
   * listings + series + stats, and does NOT serve per-match commentary /
   * scorecard / squads endpoints.
   */
  unsupportedTypes?: Array<'live' | 'recent' | 'upcoming' | 'detail' | 'comm' | 'scard' | 'team'>;
  parseMatchList: (data: any) => Match[];
  parseMatchDetail: (raw: any) => Match;
  parseCommentary: (data: any, matchId: string) => Commentary[];
  isCricbuzzLike: boolean; // true = supports miniscore/batsmen/oSummary in comm
}

const PROVIDERS: Record<string, ProviderConfig> = {
  'cricbuzz-cricket': {
    host: HOST_1,
    endpoints: {
      live: '/matches/v1/live',
      recent: '/matches/v1/recent',
      upcoming: '/matches/v1/upcoming',
      matchDetail: (id: string) => `/mcenter/v1/${id}`,
      commentary: (id: string) => `/mcenter/v1/${id}/comm`,
      scorecard: (id: string) => `/mcenter/v1/${id}/scard`,
      teamSquad: (id: string, teamId: string) => `/mcenter/v1/${id}/team/${teamId}`,
    },
    parseMatchList: extractAllCricbuzz,
    parseMatchDetail: transformDetailCricbuzz,
    parseCommentary: parseCommentaryCricbuzz,
    isCricbuzzLike: true,
  },
  'cricbuzz-cricket2': {
    host: HOST_2,
    endpoints: {
      live: '/matches/v1/live',
      recent: '/matches/v1/recent',
      upcoming: '/matches/v1/upcoming',
      matchDetail: (id: string) => `/mcenter/v1/${id}`,
      commentary: (id: string) => `/mcenter/v1/${id}/comm`,
      scorecard: (id: string) => `/mcenter/v1/${id}/scard`,
      teamSquad: (id: string, teamId: string) => `/mcenter/v1/${id}/team/${teamId}`,
    },
    // Live-probed 2026-04-18: Host 2 serves live / recent / upcoming /
    // matchDetail / commentary / scorecard ✅ but returns 404 for
    // `/mcenter/v1/{id}/team/{teamId}`. Squads must therefore go to Host 1.
    unsupportedTypes: ['team'],
    parseMatchList: extractAllCricbuzz,
    parseMatchDetail: transformDetailCricbuzz,
    parseCommentary: parseCommentaryCricbuzz,
    isCricbuzzLike: true,
  },
};

const DEFAULT_PROVIDER = 'cricbuzz-cricket';

function getProviderConfig(name: string): ProviderConfig {
  return PROVIDERS[name] || PROVIDERS[DEFAULT_PROVIDER];
}

function getEndpointForType(config: ProviderConfig, type: string, matchId?: string, teamId?: string): string {
  switch (type) {
    case 'live': return config.endpoints.live;
    case 'recent': return config.endpoints.recent;
    case 'upcoming': return config.endpoints.upcoming;
    case 'detail': return config.endpoints.matchDetail(matchId!);
    case 'comm': return config.endpoints.commentary(matchId!);
    case 'scard': return config.endpoints.scorecard(matchId!);
    case 'team': return config.endpoints.teamSquad(matchId!, teamId!);
    default: return config.endpoints.live;
  }
}

// ============ RANDOM SHUFFLE (Fisher-Yates) ============
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============ API CALL HELPERS ============

// Try a single API call with given key and host
async function tryApiCall(endpoint: string, apiKey: string, apiHost: string, params?: Record<string, string>): Promise<any> {
  const res = await axios.get(`https://${apiHost}${endpoint}`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': apiHost },
    params,
    timeout: 12000,
  });
  // If API returns error message (e.g. "Not subscribed"), throw so caller can try next key
  if (res.data?.message) {
    throw new Error(`API message: ${res.data.message}`);
  }
  if (res.data) return res.data;
  return null;
}

// ============ MAIN DATA FETCHER (Triple-Engine with Sequential Failover) ============
// Priority 1: Firebase Keys — 3 providers, each with up to 5 keys
//   → Try all keys for Provider 1 (current_provider) on its host
//   → If all fail (429/403), try all keys for Provider 2 on its host
//   → If all fail, try all keys for Provider 3 on its host
// Priority 2: Single Firebase key fallback (tries all 3 hosts)
// Priority 3: User custom API key
//
// Returns { data, providerName } or null

async function fetchData(
  endpointType: 'live' | 'recent' | 'upcoming' | 'detail' | 'comm' | 'scard' | 'team',
  matchId?: string,
  queryParams?: Record<string, string>,
  teamId?: string
): Promise<{ data: any; providerName: string } | null> {

  // ===== Wait for Firebase to load keys =====
  if (_waitForFirebaseKey) {
    await _waitForFirebaseKey(5000);
  }

  // ===== TRY ALL FIREBASE KEYS (shuffled for load balancing) =====
  const allProviders = _getAllProviders ? _getAllProviders() : [];

  // All known Cricbuzz hosts (for provider config lookup)
  const ALL_HOSTS = [HOST_1, HOST_2];

  // ROTATION LOGIC: Try each provider sequentially.
  // For each provider: try ALL its keys on its OWN host.
  // If all keys fail (429/403), move to next provider.
  for (const provider of allProviders) {
    const providerName = provider.name;
    // Find the correct provider config for this host
    const configName = Object.keys(PROVIDERS).find(k => PROVIDERS[k].host === provider.host) || DEFAULT_PROVIDER;
    const config = getProviderConfig(configName);

    // Skip this provider if it doesn't support the requested endpoint type.
    // Host 3 (`cricbuzz-real-time`), for example, does not serve match-detail
    // / commentary / scorecard / teamSquad endpoints — those are only on
    // Host 1 / Host 2.
    if (config.unsupportedTypes && config.unsupportedTypes.includes(endpointType)) {
      console.log(`[API] Provider ${configName} does not support "${endpointType}" — skipping to next provider`);
      continue;
    }

    const endpoint = getEndpointForType(config, endpointType, matchId, teamId);

    for (const key of provider.keys) {
      try {
        const result = await tryApiCall(endpoint, key, provider.host, queryParams);
        if (result) {
          console.log(`[API] SUCCESS: key ${key.substring(0, 12)}... @ ${provider.host}`);
          return { data: result, providerName: configName };
        }
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 429 || status === 403) {
          if (_markKeyFailed) _markKeyFailed(key);
          console.log(`[API] Key ${key.substring(0, 12)}... got ${status} on ${provider.host} — trying next key`);
          // Continue to next key for this provider
        } else {
          console.log(`[API] Key ${key.substring(0, 12)}... error on ${provider.host}: ${e?.message || 'unknown'}`);
          // Non-rate-limit error — still try next key
        }
      }
    }
    console.log(`[API] All keys for ${providerName} (${provider.host}) exhausted — switching to next provider`);
  }

  // ===== FALLBACK: Single Firebase key — try on ALL known hosts =====
  const fb = _getFirebaseKey ? _getFirebaseKey() : null;
  if (fb && fb.apiKey && fb.apiHost) {
    // Try the configured host first, then other known hosts
    const hostsToTry = [fb.apiHost, ...ALL_HOSTS.filter(h => h !== fb.apiHost)];
    for (const host of hostsToTry) {
      const configName = Object.keys(PROVIDERS).find(k => PROVIDERS[k].host === host) || DEFAULT_PROVIDER;
      const config = getProviderConfig(configName);
      // Skip hosts that don't support this endpoint type (e.g. Host 3 for
      // match-detail / commentary / scorecard / squads).
      if (config.unsupportedTypes && config.unsupportedTypes.includes(endpointType)) {
        continue;
      }
      const endpoint = getEndpointForType(config, endpointType, matchId, teamId);
      try {
        const result = await tryApiCall(endpoint, fb.apiKey, host, queryParams);
        if (result) {
          console.log(`[API] Firebase single key SUCCESS on ${host}`);
          return { data: result, providerName: configName };
        }
      } catch (e: any) {
        console.log(`[API] Firebase single key FAILED on ${host}: ${e?.message || 'unknown'}`);
      }
    }
  }

  // ===== LAST RESORT: User Custom API Key =====
  const userKey = await getUserApiKey();
  if (userKey) {
    const config = PROVIDERS[DEFAULT_PROVIDER];
    const endpoint = getEndpointForType(config, endpointType, matchId, teamId);
    try {
      const result = await tryApiCall(endpoint, userKey, HOST_1, queryParams);
      if (result) {
        console.log('[API] User custom key SUCCESS');
        return { data: result, providerName: DEFAULT_PROVIDER };
      }
    } catch {
      console.log('[API] User custom key failed');
    }
  }

  console.log('[API] All keys exhausted for:', endpointType);

  // Show debug info on first failure so user can see exact error
  const debugLog = _getDebugLog ? _getDebugLog() : [];
  const debugInfo = [
    `Providers: ${allProviders.length}`,
    `Firebase key: ${fb ? 'found' : 'null'}`,
    ...debugLog.slice(-5),
  ].join('\n');
  console.log('[API DEBUG]\n' + debugInfo);

  return null;
}

// ============ CACHE HELPERS ============
const CACHE_TTL = 60000; // 1 minute cache for lists
const MATCH_DETAIL_CACHE_TTL = 30000; // 30 seconds for match details (live data needs fresher)
const CACHE_CLEANUP_INTERVAL = 3600000; // 1 hour - auto cleanup interval
const CACHE_PREFIX = 'cricapp_';

// Track all cache keys for cleanup
let cacheKeys: Set<string> = new Set();
let cleanupTimerId: ReturnType<typeof setInterval> | null = null;

async function getCached(key: string): Promise<any> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Use shorter TTL for match details
    const ttl = key.startsWith('match_') ? MATCH_DETAIL_CACHE_TTL : CACHE_TTL;
    if (Date.now() - ts > ttl) {
      // Auto-remove expired cache
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
      cacheKeys.delete(key);
      return null;
    }
    return data;
  } catch { return null; }
}

async function setCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ data, ts: Date.now() }));
    cacheKeys.add(key);
  } catch {}
}

// Clear all expired cache entries (excludes settings like API key)
async function clearExpiredCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    // Only clear cache keys, NOT settings (API_KEY_STORAGE)
    const cacheOnlyKeys = allKeys.filter(k => 
      k.startsWith(CACHE_PREFIX) && 
      k !== API_KEY_STORAGE && 
      !k.includes('user_api_key') &&
      !k.includes('settings') &&
      !k.includes('tracked_matches') &&
      !k.includes('auto_track')
    );
    
    for (const fullKey of cacheOnlyKeys) {
      try {
        const raw = await AsyncStorage.getItem(fullKey);
        if (raw) {
          const { ts } = JSON.parse(raw);
          const key = fullKey.replace(CACHE_PREFIX, '');
          const ttl = key.startsWith('match_') ? MATCH_DETAIL_CACHE_TTL : CACHE_TTL;
          
          // Remove if expired (older than TTL)
          if (Date.now() - ts > ttl) {
            await AsyncStorage.removeItem(fullKey);
            cacheKeys.delete(key);
          }
        }
      } catch {
        // Don't remove on parse error - might be settings
      }
    }
    console.log('[Cache] Cleanup completed');
  } catch (err) {
    console.warn('[Cache] Cleanup error:', err);
  }
}

// Clear ALL API cache only (NOT settings)
async function clearAllCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    // Only clear cache keys: live, recent, upcoming, match_*
    const cacheOnlyKeys = allKeys.filter(k => 
      k.startsWith(CACHE_PREFIX) && 
      (k.includes('_live') || k.includes('_recent') || k.includes('_upcoming') || k.includes('_match_'))
    );
    if (cacheOnlyKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheOnlyKeys);
    }
    cacheKeys.clear();
    console.log('[Cache] All API cache cleared');
  } catch {}
}

// Start auto-cleanup timer (runs every 1 hour)
function startCacheCleanup(): void {
  if (cleanupTimerId) return; // Already running
  
  // Initial cleanup on start
  clearExpiredCache();
  
  // Schedule hourly cleanup
  cleanupTimerId = setInterval(() => {
    clearExpiredCache();
  }, CACHE_CLEANUP_INTERVAL);
  
  console.log('[Cache] Auto-cleanup started (1 hour interval)');
}

// Stop cleanup timer (call on app unmount if needed)
function stopCacheCleanup(): void {
  if (cleanupTimerId) {
    clearInterval(cleanupTimerId);
    cleanupTimerId = null;
  }
}

// Initialize cache cleanup on module load
startCacheCleanup();

// ============ CRICBUZZ MATCH TRANSFORMATION ============
// Used by all Cricbuzz-style providers (cricbuzz-cricket, cricbuzz-cricket2, cricbuzz-real-time).
// Match list API uses camelCase inside matchInfo wrapper

function transformListMatch(m: any): Match {
  const info = m.matchInfo || {};
  const score = m.matchScore || {};
  const t1 = info.team1 || {};
  const t2 = info.team2 || {};
  const venue = info.venueInfo || {};
  const t1s = score.team1Score?.inngs1 || {};
  const t2s = score.team2Score?.inngs1 || {};

  const startEpoch = info.startDate ? Number(info.startDate) : undefined;

  return {
    matchId: String(info.matchId || ''),
    seriesName: info.seriesName || '',
    matchDesc: info.matchDesc || '',
    matchType: info.matchFormat || 'T20',
    status: classifyState(info.state),
    statusText: info.status || info.stateTitle || '',
    venue: venue.ground || '',
    city: venue.city || '',
    startTime: info.startDate ? formatTs(info.startDate) : '',
    // v1.0.16 Rev 5 — numeric epoch for time-sorted multi-select list.
    startTimestamp: typeof startEpoch === 'number' && !Number.isNaN(startEpoch) ? startEpoch : undefined,
    teams: [
      { name: t1.teamName || '?', shortName: t1.teamSName || '?', runs: t1s.runs, wickets: t1s.wickets, overs: t1s.overs, teamId: t1.teamId, imageId: t1.imageId },
      { name: t2.teamName || '?', shortName: t2.teamSName || '?', runs: t2s.runs, wickets: t2s.wickets, overs: t2s.overs, teamId: t2.teamId, imageId: t2.imageId },
    ],
  };
}

// Match detail API uses lowercase, FLAT (no matchInfo wrapper)
function transformDetailCricbuzz(raw: any): Match {
  const t1 = raw.team1 || {};
  const t2 = raw.team2 || {};
  const venue = raw.venueinfo || raw.venueInfo || {};

  return {
    matchId: String(raw.matchid || raw.matchId || ''),
    seriesName: raw.seriesname || raw.seriesName || '',
    matchDesc: raw.matchdesc || raw.matchDesc || '',
    matchType: raw.matchformat || raw.matchFormat || '',
    status: classifyState(raw.state),
    // Prefer shortstatus (result) over status (toss info)
    statusText: raw.shortstatus || raw.status || '',
    venue: venue.ground || '',
    city: venue.city || '',
    startTime: raw.startdate ? formatTs(raw.startdate) : '',
    teams: [
      { name: t1.teamname || t1.teamName || '?', shortName: t1.teamsname || t1.teamSName || '?', teamId: t1.teamid || t1.teamId, imageId: t1.imageid || t1.imageId },
      { name: t2.teamname || t2.teamName || '?', shortName: t2.teamsname || t2.teamSName || '?', teamId: t2.teamid || t2.teamId, imageId: t2.imageid || t2.imageId },
    ],
  };
}

function classifyState(state?: string): 'live' | 'recent' | 'upcoming' {
  if (!state) return 'upcoming';
  const s = state.toLowerCase();
  if (s === 'complete' || s === 'result' || s === 'abandon') return 'recent';
  if (s === 'preview' || s === 'upcoming' || s === '') return 'upcoming';
  // Everything else is live: "In Progress", "Stumps", "Innings Break", "Toss", "Rain", "Tea", etc.
  return 'live';
}

function formatTs(ts?: number | string): string {
  if (!ts) return '';
  try {
    const d = new Date(typeof ts === 'string' ? parseInt(ts, 10) : ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

// Extract matches from nested Cricbuzz API structure (handles ALL depth levels)
function extractAllCricbuzz(data: any): Match[] {
  if (!data?.typeMatches) return [];
  const out: Match[] = [];
  for (const typeMatch of data.typeMatches) {
    // API gives us the category directly: "International", "League", "Domestic", "Women"
    const apiCategory = typeMatch.matchType || '';
    const seriesArr = typeMatch.seriesMatches || [];
    for (const series of seriesArr) {
      // seriesAdWrapper can be at different nesting levels
      const wrapper = series.seriesAdWrapper || series;
      const matches = wrapper.matches || [];
      for (const m of matches) {
        if (m.matchInfo) {
          const match = transformListMatch(m);
          // Use API-provided category directly instead of guessing
          match.category = apiCategory as any;
          out.push(match);
        }
      }
    }
  }
  return out;
}

// ============ CRICBUZZ COMMENTARY PARSING ============
// comwrapper[i].commentary is a SINGLE DICT (one ball), not a list!

function cleanText(raw: string): string {
  if (!raw) return '';
  let t = raw.replace(/[A-Z]\d+\$,?\s*/g, '');
  t = t.replace(/^[\s,]+|[\s,]+$/g, '');
  // Fix \n literal rendering — convert to actual newlines
  t = t.replace(/\\n/g, '\n');
  t = t.replace(/\\r/g, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function mapEvent(e?: string): Commentary['event'] {
  if (!e) return 'normal';
  const s = e.toLowerCase().trim();
  // Only map explicit events - avoid false positives
  if (s.includes('wicket') || s === 'w' || s === 'out') return 'wicket';
  if (s.includes('six') || s === '6s' || s === '6') return 'six';
  if (s.includes('four') || s.includes('boundary') || s === '4s' || s === '4') return 'four';
  if (s.includes('wide') || s === 'wd') return 'wide';
  // Only exact "dot" text, not "0" or "none" (these are just runs)
  if (s === 'dot') return 'dot';
  return 'normal';
}

/**
 * Decide the display event for a ball using (a) Cricbuzz's eventtype/event
 * field first, then (b) a fallback inferred from the structured `runs` &
 * `extras` fields when the API leaves eventtype blank.
 *
 * Why: v1.0.10 relied purely on `eventtype` — but Cricbuzz occasionally
 * omits it for sixes/fours, making those balls render as "normal" text
 * (user reported a SIX appearing as plain commentary). Using the numeric
 * `runs` field as a safety net guarantees the purple SIX / green FOUR
 * badge always shows on the right ball.
 */
function resolveEvent(rawC: any): Commentary['event'] {
  const explicit = mapEvent(rawC?.eventtype || rawC?.event);
  if (explicit !== 'normal') return explicit;

  // Wide / no-ball detection from flags — event badge should reflect these
  // too when eventtype is missing.
  if (rawC?.isWide || rawC?.wide) return 'wide';

  // Inspect the structured runs field (batRuns = runs off the bat, excluding
  // extras). Pure 6/4 off the bat = six/four badge. 0 off bat with no extras
  // = dot ball.
  const batR = rawC?.batRuns ?? rawC?.batruns;
  const totalR = rawC?.runs ?? rawC?.totalRuns ?? rawC?.score;
  const run = batR !== undefined && batR !== null ? Number(batR)
            : (totalR !== undefined && totalR !== null ? Number(totalR) : undefined);
  if (run === 6) return 'six';
  if (run === 4) return 'four';
  if (run === 0) {
    const extras = rawC?.extras ?? rawC?.extrasType ?? rawC?.extraType;
    if (!extras && !rawC?.isNoBall && !rawC?.noball && !rawC?.noBall) return 'dot';
  }
  return 'normal';
}

// Extract numeric runs from raw commentary data
function extractRuns(c: any): number | undefined {
  // Cricbuzz fields for runs scored on a ball
  const r = c.runs ?? c.batRuns ?? c.batruns ?? c.score ?? c.totalRuns;
  if (r !== undefined && r !== null) return Number(r);
  return undefined;
}

// Extract extras type from raw commentary data
function extractExtras(c: any): string | undefined {
  const e = c.extras ?? c.extrasType ?? c.extraType;
  if (e) return String(e).toLowerCase();
  // Check boolean flags
  if (c.isWide || c.wide) return 'wide';
  if (c.isNoBall || c.noball || c.noBall) return 'noball';
  if (c.isLegBye || c.legbye) return 'legbye';
  if (c.isBye || c.bye) return 'bye';
  return undefined;
}

// v1.0.16 — Extract Hindi commentary text from a raw API row.
// Cricbuzz's RapidAPI responses use several possible field names for
// the editorial Hindi commentary; we try them all. Only returns a
// string if the text is non-empty AND contains at least one Devanagari
// character (Unicode block 0x0900-0x097F) so we never accidentally
// route an English fallback string into the Hindi voice path (which
// was the v1.0.15 bug — Hindi voice reading English = gibberish).
function extractHindiText(c: any): string | undefined {
  if (!c) return undefined;
  const candidates = [
    c.commhindi, c.commHindi,
    c.commTxtHindi, c.commtxthindi,
    c.commentaryHindi, c.commentaryhindi,
    c.commTextHindi, c.commtexthindi,
    c.hindiCommText, c.hindicommtext,
    c.hindi, c.hindiText,
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length > 0) {
      const cleaned = cleanText(v);
      if (cleaned && /[\u0900-\u097F]/.test(cleaned)) {
        return cleaned;
      }
    }
  }
  return undefined;
}

function parseCommentaryCricbuzz(data: any, matchId: string): Commentary[] {
  if (!data) return [];
  const out: Commentary[] = [];

  // Primary format: comwrapper array, each item.commentary = single DICT
  const cw = data.comwrapper;
  if (Array.isArray(cw)) {
    for (let i = 0; i < cw.length; i++) {
      const wrapper = cw[i];
      if (!wrapper) continue;
      const c = wrapper.commentary;
      if (!c || typeof c !== 'object') continue;

      // Single commentary dict
      if (!Array.isArray(c)) {
        const text = cleanText(c.commtxt || c.commText || '');
        const hindiText = extractHindiText(c);
        const overVal = String(c.overnum ?? c.overNumber ?? '0.0');
        // Cricbuzz returns innings id per ball. We'll later filter the
        // commentary list to a single innings so recent/completed matches
        // don't show duplicate over numbers from multiple innings mixed.
        const iid = c.inningsid ?? c.inningsId ?? c.iid;
        if (text) {
          out.push({
            id: `${matchId}-${overVal}-${text.substring(0,50).replace(/[^a-zA-Z0-9]/g, '')}`,
            over: overVal,
            english: text,
            hindi: hindiText,
            event: resolveEvent(c),
            runs: extractRuns(c),
            extras: extractExtras(c),
            inningsId: iid !== undefined && iid !== null ? Number(iid) : undefined,
          });
        }
      }
      // Rare: commentary as array
      else {
        for (let j = 0; j < c.length; j++) {
          const text = cleanText(c[j]?.commtxt || c[j]?.commText || '');
          const hindiText = extractHindiText(c[j]);
          const overVal = String(c[j].overnum ?? c[j].overNumber ?? '0.0');
          const iid = c[j].inningsid ?? c[j].inningsId ?? c[j].iid;
          if (text) {
            out.push({
              id: `${matchId}-${overVal}-${text.substring(0,50).replace(/[^a-zA-Z0-9]/g, '')}`,
              over: overVal,
              english: text,
              hindi: hindiText,
              event: resolveEvent(c[j]),
              runs: extractRuns(c[j]),
              extras: extractExtras(c[j]),
              inningsId: iid !== undefined && iid !== null ? Number(iid) : undefined,
            });
          }
        }
      }
    }
  }

  // Fallback: commentaryList at root
  if (out.length === 0 && Array.isArray(data.commentaryList)) {
    for (let i = 0; i < data.commentaryList.length; i++) {
      const c = data.commentaryList[i];
      const text = cleanText(c?.commText || c?.commtxt || '');
      const hindiText = extractHindiText(c);
      const overVal = String(c.overNumber ?? c.overnum ?? '0.0');
      const iid = c.inningsid ?? c.inningsId ?? c.iid;
      if (text) {
        out.push({
          id: `${matchId}-${overVal}-${text.substring(0,50).replace(/[^a-zA-Z0-9]/g, '')}`,
          over: overVal,
          english: text,
          hindi: hindiText,
          event: resolveEvent(c),
          runs: extractRuns(c),
          extras: extractExtras(c),
          inningsId: iid !== undefined && iid !== null ? Number(iid) : undefined,
        });
      }
    }
  }

  return out;
}

// ============ PUBLIC: FETCH MATCH LISTS ============

export async function fetchLiveMatches(): Promise<Match[]> {
  // Check cache first
  const cached = await getCached('live');
  if (cached) return cached;

  const result = await fetchData('live');
  if (!result) return [];

  const config = getProviderConfig(result.providerName);
  const all = config.parseMatchList(result.data);
  // STRICT: Only matches that are NOT complete and NOT preview
  const live = all.filter(m => m.status === 'live');
  await setCache('live', live);
  return live;
}

export async function fetchRecentMatches(): Promise<Match[]> {
  const cached = await getCached('recent');
  if (cached) return cached;

  const result = await fetchData('recent');
  if (!result) return [];

  const config = getProviderConfig(result.providerName);
  const all = config.parseMatchList(result.data);
  const recent = all.filter(m => m.status === 'recent');
  await setCache('recent', recent);
  return recent;
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  const cached = await getCached('upcoming');
  if (cached) return cached;

  const result = await fetchData('upcoming');
  if (!result) return [];

  const config = getProviderConfig(result.providerName);
  const all = config.parseMatchList(result.data);
  const upcoming = all.filter(m => m.status === 'upcoming');
  await setCache('upcoming', upcoming);
  return upcoming;
}

// ============ FETCH MATCH BY ID ============

export async function fetchMatchById(id: string): Promise<Match | null> {
  // Check cache first (shorter TTL for live matches)
  const cached = await getCached(`match_${id}`);
  if (cached) return cached;

  let match: Match | null = null;
  let commentary: Commentary[] = [];
  let commRawData: any = null;

  // 1. Get match info
  try {
    const detailResult = await fetchData('detail', id);
    if (detailResult && !detailResult.data.message) {
      const config = getProviderConfig(detailResult.providerName);
      match = config.parseMatchDetail(detailResult.data);
    }
  } catch {}

  // 2. Get commentary
  try {
    const commResult = await fetchData('comm', id);
    if (commResult && !commResult.data.message) {
      const config = getProviderConfig(commResult.providerName);
      commentary = config.parseCommentary(commResult.data, id);
      commRawData = commResult.data;

      // Cricbuzz-specific: extract rich data from comm response (team names, scores, batsmen, oSummary)
      if (config.isCricbuzzLike) {
        const commData = commResult.data;

        // Extract team names from matchheaders (lowercase keys)
        const mh = commData.matchheaders || {};
        const t1h = mh.team1 || {};
        const t2h = mh.team2 || {};

        if (!match) {
          match = {
            matchId: id,
            seriesName: mh.seriesname || mh.seriesName || 'Match',
            status: classifyState(mh.state),
            statusText: mh.status || '',
            teams: [
              { name: t1h.teamname || '?', shortName: t1h.teamsname || '?' },
              { name: t2h.teamname || '?', shortName: t2h.teamsname || '?' },
            ],
          };
        } else {
          // Update names if we got them from matchheaders
          if (t1h.teamname && match.teams[0].name === '?') {
            match.teams[0].name = t1h.teamname;
            match.teams[0].shortName = t1h.teamsname || match.teams[0].shortName;
          }
          if (t2h.teamname && match.teams[1].name === '?') {
            match.teams[1].name = t2h.teamname;
            match.teams[1].shortName = t2h.teamsname || match.teams[1].shortName;
          }
        }

        // Extract scores from miniscore.inningsscores (actual API structure)
        const ms = commData.miniscore || {};
        if (ms && match) {
          const inningsScores = ms.inningsscores?.inningsscore || [];
          if (Array.isArray(inningsScores)) {
            for (const inn of inningsScores) {
              const shortName = inn.batteamshortname;
              if (shortName) {
                const idx = match.teams.findIndex(t => t.shortName === shortName);
                if (idx >= 0) {
                  match.teams[idx].runs = inn.runs;
                  match.teams[idx].wickets = inn.wickets;
                  match.teams[idx].overs = inn.overs;
                }
              }
            }
            // v1.0.16 — current batting team = last innings entry. Used
            // by the floating overlay to render only the batting team's
            // score row.
            const lastInn = inningsScores[inningsScores.length - 1];
            if (lastInn?.batteamshortname) {
              match.battingTeamShortName = lastInn.batteamshortname;
            }
          }

          // Extract current batsmen (striker and non-striker)
          const batsmen: any[] = [];
          const batsmanStriker = ms.batsmanstriker || ms.batsman1 || {};
          const batsmanNonStriker = ms.batsmannonstriker || ms.batsman2 || {};
          
          if (batsmanStriker.batname || batsmanStriker.name) {
            batsmen.push({
              name: batsmanStriker.batname || batsmanStriker.name || 'Batsman 1',
              runs: Number(batsmanStriker.batruns ?? batsmanStriker.runs ?? 0),
              balls: Number(batsmanStriker.batballs ?? batsmanStriker.balls ?? 0),
              fours: Number(batsmanStriker.batfours ?? batsmanStriker.fours ?? 0),
              sixes: Number(batsmanStriker.batsixes ?? batsmanStriker.sixes ?? 0),
              isStriker: true,
            });
          }
          if (batsmanNonStriker.batname || batsmanNonStriker.name) {
            batsmen.push({
              name: batsmanNonStriker.batname || batsmanNonStriker.name || 'Batsman 2',
              runs: Number(batsmanNonStriker.batruns ?? batsmanNonStriker.runs ?? 0),
              balls: Number(batsmanNonStriker.batballs ?? batsmanNonStriker.balls ?? 0),
              fours: Number(batsmanNonStriker.batfours ?? batsmanNonStriker.fours ?? 0),
              sixes: Number(batsmanNonStriker.batsixes ?? batsmanNonStriker.sixes ?? 0),
              isStriker: false,
            });
          }
          if (batsmen.length > 0) {
            match.batsmen = batsmen;
          }

          // Extract current bowler (Cricbuzz: bowlerstriker / bowler1).
          // We send only the attacking bowler — user wants the on-strike
          // bowler displayed in the scoreboard, not the full pair.
          const bowlerStriker = ms.bowlerstriker || ms.bowler1 || {};
          if (bowlerStriker.bowlname || bowlerStriker.name) {
            match.bowler = {
              name: bowlerStriker.bowlname || bowlerStriker.name || 'Bowler',
              overs: Number(bowlerStriker.bowlovs ?? bowlerStriker.overs ?? 0),
              maidens: Number(bowlerStriker.bowlmaidens ?? bowlerStriker.maidens ?? 0),
              runs: Number(bowlerStriker.bowlruns ?? bowlerStriker.runs ?? 0),
              wickets: Number(bowlerStriker.bowlwkts ?? bowlerStriker.wickets ?? 0),
            };
          }

          // Extract over summary - use correct Cricbuzz field names
          // recentOvsStr is the primary field from Cricbuzz miniscore for ball-by-ball
          let oSummary = ms.recentOvsStr || ms.recentovsstr || ms.o_summary || ms.recentovsummary || ms.oversummary || ms.recentOvs || '';
          
          // If no oSummary from API, build from recent commentary STRUCTURED DATA
          // Priority: runs/event/extras fields FIRST, text matching NEVER
          if (!oSummary && commentary && commentary.length > 0) {
            const recentBalls: string[] = [];
            for (let i = 0; i < Math.min(12, commentary.length); i++) {
              const comm = commentary[i];
              if (comm.over && comm.over !== '0' && /\d/.test(comm.over)) {
                // PRIORITY 1: Use event field (most reliable for special deliveries)
                if (comm.event === 'wicket') {
                  recentBalls.push('WKT');
                } else if (comm.extras === 'wide') {
                  recentBalls.push('Wd');
                } else if (comm.extras === 'noball') {
                  recentBalls.push('Nb');
                } else if (comm.event === 'six') {
                  recentBalls.push('6');
                } else if (comm.event === 'four') {
                  recentBalls.push('4');
                // PRIORITY 2: Use numeric runs field
                } else if (comm.runs !== undefined && comm.runs !== null) {
                  const r = Number(comm.runs);
                  if (r === 6) recentBalls.push('6');
                  else if (r === 4) recentBalls.push('4');
                  else recentBalls.push(String(r));
                // PRIORITY 3: Use event field for dots
                } else if (comm.event === 'dot') {
                  recentBalls.push('0');
                // PRIORITY 4: Last resort - extract number from text
                } else {
                  const text = (comm.english || '').toLowerCase();
                  const runMatch = text.match(/(\d)\s*run/);
                  if (runMatch) {
                    recentBalls.push(runMatch[1]);
                  } else if (text.includes('no run')) {
                    recentBalls.push('0');
                  } else {
                    recentBalls.push('0');
                  }
                }
              }
            }
            if (recentBalls.length > 0) {
              oSummary = recentBalls.reverse().join(' ');
            }
          }
          
          if (oSummary) {
            match.oSummary = oSummary;
          }

          // Current over number
          const currentOver = ms.overs || ms.currentover;
          if (currentOver !== undefined) {
            match.currentOver = parseFloat(currentOver);
          }

          // Always prefer commentary matchheaders status (it has actual result)
          if (mh.status) {
            match.statusText = mh.status;
          }
          if (mh.state) {
            match.status = classifyState(mh.state);
          }
        }
      }
    }
  } catch {}

  if (match) {
    match.commentary = commentary;
    // Extract pagination (tms + iid) from comm response for loading older commentary.
    const pag = extractCommPagination(commRawData);
    match.commentaryNextTimestamp = pag.tms;
    match.commentaryNextIid = pag.iid;
    // Cache the match data (30 second TTL for live updates)
    await setCache(`match_${id}`, match);
  }

  return match;
}

// ============ FETCH SCORECARD ============
export async function fetchScorecard(matchId: string): Promise<any> {
  const cached = await getCached(`scard_${matchId}`);
  if (cached) return cached;

  const result = await fetchData('scard', matchId);
  if (!result || !result.data) return null;

  const data = result.data;
  // Cache scorecard for 60 seconds
  await setCache(`scard_${matchId}`, data);
  return data;
}

// ============ FETCH MATCH INFO (for full squad data) ============
export async function fetchMatchInfo(matchId: string): Promise<any> {
  const cached = await getCached(`info_${matchId}`);
  if (cached) return cached;

  const result = await fetchData('detail', matchId);
  if (!result || !result.data) return null;

  const data = result.data;
  // Cache match info for 120 seconds
  await setCache(`info_${matchId}`, data);
  return data;
}

// ============ FETCH PLAYER INFO (for Player Detail Modal) ============
// Endpoint: /stats/v1/player/{id} — returns bio (name, role, age, batting/bowling style, teams)
// Endpoint: /stats/v1/player/{id}/batting — returns batting career stats by format
// Endpoint: /stats/v1/player/{id}/bowling — returns bowling career stats by format
export async function fetchPlayerProfile(playerId: string | number): Promise<{ info: any; batting: any; bowling: any } | null> {
  const pid = String(playerId);
  const cacheKey = `player_${pid}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const allProviders = _getAllProviders ? _getAllProviders() : [];
  const fb = _getFirebaseKey ? _getFirebaseKey() : null;

  // Use the first working provider/key we have
  const candidates: { apiKey: string; host: string }[] = [];
  for (const p of allProviders) {
    if (p?.keys) for (const k of p.keys) candidates.push({ apiKey: k, host: p.host });
  }
  if (fb?.apiKey && fb?.apiHost) candidates.push({ apiKey: fb.apiKey, host: fb.apiHost });
  if (candidates.length === 0) return null;

  for (const cand of candidates) {
    try {
      const [info, batting, bowling] = await Promise.all([
        tryApiCall(`/stats/v1/player/${pid}`, cand.apiKey, cand.host).catch(() => null),
        tryApiCall(`/stats/v1/player/${pid}/batting`, cand.apiKey, cand.host).catch(() => null),
        tryApiCall(`/stats/v1/player/${pid}/bowling`, cand.apiKey, cand.host).catch(() => null),
      ]);
      if (info || batting || bowling) {
        const result = { info, batting, bowling };
        await setCache(cacheKey, result);
        return result;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}
// Endpoint: /mcenter/v1/{matchId}/team/{teamId}
// Returns the FULL squad for one team — Playing XI, Substitutes, Bench — each player
// includes faceImageId, role, captain/keeper flags. This is the same data Cricbuzz
// app's "Squads" tab uses to render Substitutes + Bench sections with photos.
export async function fetchTeamSquad(matchId: string, teamId: string | number): Promise<any> {
  const tid = String(teamId);
  const cacheKey = `teamsquad_${matchId}_${tid}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const result = await fetchData('team', matchId, undefined, tid);
  if (!result || !result.data) return null;

  await setCache(cacheKey, result.data);
  return result.data;
}

// ============ COMMENTARY PAGINATION ============
// Extract the oldest timestamp AND innings id from a comm API response for pagination.
// Cricbuzz RapidAPI uses `tms` + `iid` query params (NOT `timestamp`) — older balls are
// retrieved by decrementing tms within the same iid, then flipping iid→iid-1 when
// the current innings is exhausted.
function extractCommPagination(data: any): { tms?: number; iid?: number } {
  const out: { tms?: number; iid?: number } = {};
  if (!data) return out;

  const cw = data.comwrapper;
  if (Array.isArray(cw) && cw.length > 0) {
    // Oldest ball = last item in wrapper; check multiple key variants
    for (let i = cw.length - 1; i >= 0; i--) {
      const w = cw[i];
      const c = w?.commentary || w;
      const ts = w?.timestamp ?? c?.timestamp ?? w?.tms ?? c?.tms;
      const iid = w?.inningsid ?? w?.inningsId ?? c?.inningsid ?? c?.inningsId ?? c?.iid ?? w?.iid;
      if (ts && !out.tms) out.tms = Number(ts);
      if (iid && out.iid === undefined) out.iid = Number(iid);
      if (out.tms && out.iid !== undefined) break;
    }
  }

  // Fallback: commentaryList
  if (!out.tms && Array.isArray(data.commentaryList) && data.commentaryList.length > 0) {
    const last = data.commentaryList[data.commentaryList.length - 1];
    if (last?.timestamp) out.tms = Number(last.timestamp);
    if (last?.inningsId) out.iid = Number(last.inningsId);
  }

  // miniscore.inningsid / matchheaders for current innings (fallback)
  if (out.iid === undefined) {
    const mi = data.miniscore || {};
    const mh = data.matchheaders || {};
    const iid = mi.inningsid ?? mi.inningsId ?? mh.inningsid ?? mh.inningsId;
    if (iid !== undefined) out.iid = Number(iid);
  }

  return out;
}

// Legacy wrapper retained for any caller that only needs the timestamp
function extractCommTimestamp(data: any): number | undefined {
  return extractCommPagination(data).tms;
}

// Fetch older commentary using (tms, iid) pagination (for "Load More" / Sync-on-Open).
// Returns empty when the server has no more history.
// Automatically steps iid down (iid-1) when the current innings is exhausted so we
// can walk all the way back to ball 0.1 of innings 1 regardless of how many innings
// the match has.
export async function fetchMoreCommentary(
  matchId: string,
  tms: number,
  iid?: number
): Promise<{ commentary: Commentary[]; nextTimestamp?: number; nextIid?: number }> {
  const params: Record<string, string> = { tms: String(tms) };
  if (iid !== undefined) params.iid = String(iid);

  try {
    const result = await fetchData('comm', matchId, params);
    if (!result || !result.data) {
      // Try stepping down to previous innings if we have one
      if (iid !== undefined && iid > 1) {
        return fetchMoreCommentary(matchId, Date.now(), iid - 1);
      }
      // No iid known → try iid=1 as a last-ditch attempt (covers matches that
      // report innings via miniscore only in later calls)
      if (iid === undefined) {
        return fetchMoreCommentary(matchId, Date.now(), 1);
      }
      return { commentary: [] };
    }

    const config = getProviderConfig(result.providerName);
    const commentary = config.parseCommentary(result.data, matchId);

    if (commentary.length === 0) {
      // Current innings exhausted — try previous innings
      if (iid !== undefined && iid > 1) {
        return fetchMoreCommentary(matchId, Date.now(), iid - 1);
      }
      if (iid === undefined) {
        return fetchMoreCommentary(matchId, Date.now(), 1);
      }
      return { commentary: [] };
    }

    const pag = extractCommPagination(result.data);
    // Guard: if API echoes the same (or newer) timestamp within the same innings,
    // flip to previous innings OR treat as end-of-history.
    let safeNextTms: number | undefined;
    let safeNextIid: number | undefined = pag.iid ?? iid;

    if (pag.tms && pag.tms < tms) {
      safeNextTms = pag.tms;
    } else if (safeNextIid !== undefined && safeNextIid > 1) {
      // Current innings has no older balls → step to previous innings next call
      safeNextIid = safeNextIid - 1;
      safeNextTms = Date.now(); // fresh start-point for previous innings
    } else {
      safeNextTms = undefined; // end-of-history
    }

    return { commentary, nextTimestamp: safeNextTms, nextIid: safeNextIid };
  } catch {
    return { commentary: [] };
  }
}


// ============ API DEBUG INFO ============
export function getApiDebugInfo(): string {
  const debugLog = _getDebugLog ? _getDebugLog() : ['Firebase debug not available'];
  const providers = _getAllProviders ? _getAllProviders() : [];
  const fb = _getFirebaseKey ? _getFirebaseKey() : null;

  return [
    `=== API Debug ===`,
    `Firebase module: ${_getFirebaseKey ? 'loaded' : 'FAILED TO LOAD'}`,
    `Providers: ${providers.length}`,
    providers.map((p, i) => `  P${i+1}: ${p.name} | ${p.host} | ${p.keys.length} keys`).join('\n'),
    `Current key: ${fb ? `${fb.apiKey.substring(0, 15)}... @ ${fb.apiHost}` : 'NULL'}`,
    `--- Firebase Log ---`,
    ...debugLog,
  ].join('\n');
}


// ============ DEEP LINK ============
// v1.0.16 — Cricbuzz external scorecard link disabled per user directive
// 2026-05-06. Function kept as a no-op stub for back-compat with any
// callers that still import it.

export const openExternalScorecard = (_matchId: string) => {
  // Intentionally no-op. Cricbuzz redirect removed.
  return;
};

// ============ CACHE MANAGEMENT EXPORTS ============
export { clearAllCache, clearExpiredCache };
