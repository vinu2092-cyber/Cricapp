import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking, Alert } from 'react-native';
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

// ---- Provider 3: cricbuzz-real-time-cricket-api ----
const HOST_3 = "cricbuzz-real-time-cricket-api.p.rapidapi.com";

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
  };
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
    },
    parseMatchList: extractAllCricbuzz,
    parseMatchDetail: transformDetailCricbuzz,
    parseCommentary: parseCommentaryCricbuzz,
    isCricbuzzLike: true,
  },
  'cricbuzz-real-time': {
    host: HOST_3,
    endpoints: {
      live: '/matches/v1/live',
      recent: '/matches/v1/recent',
      upcoming: '/matches/v1/upcoming',
      matchDetail: (id: string) => `/mcenter/v1/${id}`,
      commentary: (id: string) => `/mcenter/v1/${id}/comm`,
      scorecard: (id: string) => `/mcenter/v1/${id}/scard`,
    },
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

function getEndpointForType(config: ProviderConfig, type: string, matchId?: string): string {
  switch (type) {
    case 'live': return config.endpoints.live;
    case 'recent': return config.endpoints.recent;
    case 'upcoming': return config.endpoints.upcoming;
    case 'detail': return config.endpoints.matchDetail(matchId!);
    case 'comm': return config.endpoints.commentary(matchId!);
    case 'scard': return config.endpoints.scorecard(matchId!);
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
  endpointType: 'live' | 'recent' | 'upcoming' | 'detail' | 'comm' | 'scard',
  matchId?: string,
  queryParams?: Record<string, string>
): Promise<{ data: any; providerName: string } | null> {

  // ===== Wait for Firebase to load keys =====
  if (_waitForFirebaseKey) {
    await _waitForFirebaseKey(5000);
  }

  // ===== TRY ALL FIREBASE KEYS (shuffled for load balancing) =====
  const allProviders = _getAllProviders ? _getAllProviders() : [];

  // All known Cricbuzz hosts (for provider config lookup)
  const ALL_HOSTS = [HOST_1, HOST_2, HOST_3];

  // ROTATION LOGIC: Try each provider sequentially.
  // For each provider: try ALL its keys on its OWN host.
  // If all keys fail (429/403), move to next provider.
  for (const provider of allProviders) {
    const providerName = provider.name;
    // Find the correct provider config for this host
    const configName = Object.keys(PROVIDERS).find(k => PROVIDERS[k].host === provider.host) || DEFAULT_PROVIDER;
    const config = getProviderConfig(configName);
    const endpoint = getEndpointForType(config, endpointType, matchId);

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
      const endpoint = getEndpointForType(config, endpointType, matchId);
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
    const endpoint = getEndpointForType(config, endpointType, matchId);
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
    teams: [
      { name: t1.teamName || '?', shortName: t1.teamSName || '?', runs: t1s.runs, wickets: t1s.wickets, overs: t1s.overs },
      { name: t2.teamName || '?', shortName: t2.teamSName || '?', runs: t2s.runs, wickets: t2s.wickets, overs: t2s.overs },
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
      { name: t1.teamname || t1.teamName || '?', shortName: t1.teamsname || t1.teamSName || '?' },
      { name: t2.teamname || t2.teamName || '?', shortName: t2.teamsname || t2.teamSName || '?' },
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
        const overVal = String(c.overnum ?? c.overNumber ?? '0.0');
        if (text) {
          out.push({
            id: `${matchId}-${overVal}-${text.substring(0,50).replace(/[^a-zA-Z0-9]/g, '')}`,
            over: overVal,
            english: text,
            event: mapEvent(c.eventtype || c.event),
            runs: extractRuns(c),
            extras: extractExtras(c),
          });
        }
      }
      // Rare: commentary as array
      else {
        for (let j = 0; j < c.length; j++) {
          const text = cleanText(c[j]?.commtxt || c[j]?.commText || '');
          const overVal = String(c[j].overnum ?? c[j].overNumber ?? '0.0');
          if (text) {
            out.push({
              id: `${matchId}-${overVal}-${text.substring(0,50).replace(/[^a-zA-Z0-9]/g, '')}`,
              over: overVal,
              english: text,
              event: mapEvent(c[j].eventtype || c[j].event),
              runs: extractRuns(c[j]),
              extras: extractExtras(c[j]),
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
      const overVal = String(c.overNumber ?? c.overnum ?? '0.0');
      if (text) {
        out.push({
          id: `${matchId}-${overVal}-${text.substring(0,50).replace(/[^a-zA-Z0-9]/g, '')}`,
          over: overVal,
          english: text,
          event: mapEvent(c.event || c.eventtype),
          runs: extractRuns(c),
          extras: extractExtras(c),
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
          }

          // Extract current batsmen (striker and non-striker)
          const batsmen: any[] = [];
          const batsmanStriker = ms.batsmanstriker || ms.batsman1 || {};
          const batsmanNonStriker = ms.batsmannonstriker || ms.batsman2 || {};
          
          if (batsmanStriker.batname || batsmanStriker.name) {
            batsmen.push({
              name: batsmanStriker.batname || batsmanStriker.name || 'Batsman 1',
              runs: batsmanStriker.batruns ?? batsmanStriker.runs ?? 0,
              balls: batsmanStriker.batballs ?? batsmanStriker.balls ?? 0,
              isStriker: true,
            });
          }
          if (batsmanNonStriker.batname || batsmanNonStriker.name) {
            batsmen.push({
              name: batsmanNonStriker.batname || batsmanNonStriker.name || 'Batsman 2',
              runs: batsmanNonStriker.batruns ?? batsmanNonStriker.runs ?? 0,
              balls: batsmanNonStriker.batballs ?? batsmanNonStriker.balls ?? 0,
              isStriker: false,
            });
          }
          if (batsmen.length > 0) {
            match.batsmen = batsmen;
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
    // Extract pagination timestamp from comm response for loading older commentary
    match.commentaryNextTimestamp = extractCommTimestamp(commRawData);
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

// ============ COMMENTARY PAGINATION ============
// Extract the oldest timestamp from a comm API response for pagination
function extractCommTimestamp(data: any): number | undefined {
  if (!data) return undefined;
  const cw = data.comwrapper;
  if (Array.isArray(cw) && cw.length > 0) {
    // The last item in comwrapper is the oldest ball in this batch
    const last = cw[cw.length - 1];
    const ts = last?.timestamp ?? last?.commentary?.timestamp;
    if (ts) return Number(ts);
  }
  // Fallback: check commentaryList
  if (Array.isArray(data.commentaryList) && data.commentaryList.length > 0) {
    const last = data.commentaryList[data.commentaryList.length - 1];
    const ts = last?.timestamp;
    if (ts) return Number(ts);
  }
  return undefined;
}

// Fetch older commentary using timestamp pagination (for "Load More" / Sync-on-Open)
// IMPORTANT: When the server returns nothing (we've reached ball 0.1), we MUST return empty
// instead of falling back to the latest page — otherwise Sync-on-Open loops forever.
export async function fetchMoreCommentary(
  matchId: string,
  timestamp: number
): Promise<{ commentary: Commentary[]; nextTimestamp?: number }> {
  try {
    const result = await fetchData('comm', matchId, { timestamp: String(timestamp) });
    if (!result || !result.data) return { commentary: [] };

    const config = getProviderConfig(result.providerName);
    const commentary = config.parseCommentary(result.data, matchId);
    if (commentary.length === 0) return { commentary: [] };

    const nextTimestamp = extractCommTimestamp(result.data);
    // Guard: if API echoes the same (or newer) timestamp, treat as end-of-history
    const safeNext = nextTimestamp && nextTimestamp < timestamp ? nextTimestamp : undefined;
    return { commentary, nextTimestamp: safeNext };
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

export const openExternalScorecard = (matchId: string) => {
  Alert.alert(
    'External Link',
    'You will be redirected to an external website for more details. Do you want to continue?',
    [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        onPress: () => {
          Linking.openURL(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`).catch(() => {});
        },
      },
    ]
  );
};

// ============ CACHE MANAGEMENT EXPORTS ============
export { clearAllCache, clearExpiredCache };
