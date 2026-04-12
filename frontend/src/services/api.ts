import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ FIREBASE - SAFE LAZY LOAD ============
// Firebase is loaded lazily so if it crashes, API still works with hardcoded keys
let _getFirebaseKey: (() => { apiKey: string; apiHost: string; provider: string } | null) | null = null;
let _waitForFirebaseKey: ((timeoutMs?: number) => Promise<{ apiKey: string; apiHost: string; provider: string } | null>) | null = null;

try {
  const fb = require('./FirebaseKeyService');
  fb.initFirebaseKeyFetch();
  _getFirebaseKey = fb.getFirebaseKey;
  _waitForFirebaseKey = fb.waitForFirebaseKey;
  console.log('[API] Firebase module loaded successfully');
} catch (e) {
  console.warn('[API] Firebase module failed to load, using hardcoded keys only:', e);
  _getFirebaseKey = null;
  _waitForFirebaseKey = null;
}

// ============ API KEY MANAGEMENT ============
const API_KEY_STORAGE = 'cricapp_user_api_key';

// ---- Provider 1: cricbuzz-cricket (Original) ----
const HOST_1 = "cricbuzz-cricket.p.rapidapi.com";

// Keys for commentary endpoint
const COMM_KEYS = [
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "6a948b174dmsh4e7c9f6c75d3531p10b8e4jsna91b6b6ba925",
  "be681ef5f4mshf8eb5972bbbe7abp1d55d8jsn54464cbad4d4",
  "efa0ba9303mshae4ea9f45a69057p1fde83jsn4ec1c45ca5e5",
];

// All keys for match endpoints (19 keys - Provider 1)
const MATCH_KEYS_P1 = [
  // Original keys
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",
  "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",
  "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
  "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
  "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
  "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
  "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
  "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
  // Batch 1 keys
  "39135304c0msh9b36fa9057dbf23p141f77jsnfb140a4c7127",
  "3151754456msh3821b80e3429ed0p15ac70jsn887be255a4d6",
  "6a948b174dmsh4e7c9f6c75d3531p10b8e4jsna91b6b6ba925",
  "1a6681fd59mshb9cbb21cf3aa0f3p127c5djsnc12085b39c27",
  // Batch 2 keys
  "be681ef5f4mshf8eb5972bbbe7abp1d55d8jsn54464cbad4d4",
  "efa0ba9303mshae4ea9f45a69057p1fde83jsn4ec1c45ca5e5",
  "49895f57cbmshcecd98ee667ebbep185640jsn45fede2e9915",
  "3b5c50ff5fmsh88c6a221cb3a9a7p165328jsn4cba85fb1e16",
  "948dd6c539mshaa5cfb3e03965b1p1f1a63jsnbc538a0ddabf",
];

// ---- Provider 2: free-cricbuzz-cricket-api (New - 6 keys) ----
const HOST_2 = "free-cricbuzz-cricket-api.p.rapidapi.com";
const MATCH_KEYS_P2 = [
  "49895f57cbmshcecd98ee667ebbep185640jsn45fede2e9915",
  "60879faad9msh89b61d15d1973d2p179cc2jsn14d1545f0248",
  "015297ae4cmsh74b2c66b2201689p1d04dajsnfdca916f695f",
  "3b5c50ff5fmsh88c6a221cb3a9a7p165328jsn4cba85fb1e16",
  "948dd6c539mshaa5cfb3e03965b1p1f1a63jsnbc538a0ddabf",
  "efa0ba9303mshae4ea9f45a69057p1fde83jsn4ec1c45ca5e5",
];

// Combined MATCH_KEYS for backward-compatible references (25 total)
const MATCH_KEYS = [...MATCH_KEYS_P1, ...MATCH_KEYS_P2];

// ---- Provider 3: cricket-live-data ----
const HOST_3 = "cricket-live-data.p.rapidapi.com";

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
    },
    parseMatchList: extractAllCricbuzz,
    parseMatchDetail: transformDetailCricbuzz,
    parseCommentary: parseCommentaryCricbuzz,
    isCricbuzzLike: true,
  },
  'free-cricbuzz-cricket': {
    host: HOST_2,
    endpoints: {
      live: '/matches/v1/live',
      recent: '/matches/v1/recent',
      upcoming: '/matches/v1/upcoming',
      matchDetail: (id: string) => `/mcenter/v1/${id}`,
      commentary: (id: string) => `/mcenter/v1/${id}/comm`,
    },
    parseMatchList: extractAllCricbuzz,
    parseMatchDetail: transformDetailCricbuzz,
    parseCommentary: parseCommentaryCricbuzz,
    isCricbuzzLike: true,
  },
  'cricket-live-data': {
    host: HOST_3,
    endpoints: {
      live: '/fixtures',
      recent: '/results',
      upcoming: '/fixtures',
      matchDetail: (id: string) => `/match/${id}`,
      commentary: (id: string) => `/match/${id}/scorecard`,
    },
    parseMatchList: extractAllCricketLiveData,
    parseMatchDetail: transformDetailCricketLiveData,
    parseCommentary: parseCommentaryCricketLiveData,
    isCricbuzzLike: false,
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
async function tryApiCall(endpoint: string, apiKey: string, apiHost: string): Promise<any> {
  const res = await axios.get(`https://${apiHost}${endpoint}`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': apiHost },
    timeout: 12000,
  });
  if (res.data && !res.data.message) return res.data;
  return null;
}

// ============ MAIN DATA FETCHER (Provider-Agnostic with Fallback) ============
// Priority 1: Firebase Key (wait up to 5s)
// Priority 2: User custom key
// Priority 3: Random rotation of 25 hardcoded keys across both Cricbuzz hosts
//
// Returns { data, providerName } or null

async function fetchData(
  endpointType: 'live' | 'recent' | 'upcoming' | 'detail' | 'comm',
  matchId?: string
): Promise<{ data: any; providerName: string } | null> {

  // ===== PRIORITY 1: Firebase Key (wait up to 5 seconds) =====
  let fb = _getFirebaseKey ? _getFirebaseKey() : null;
  if (!fb && _waitForFirebaseKey) {
    console.log('[API] Waiting for Firebase key (max 5s)...');
    fb = await _waitForFirebaseKey(5000);
  }

  if (fb && fb.apiKey && fb.apiHost) {
    const providerName = fb.provider || DEFAULT_PROVIDER;
    const config = getProviderConfig(providerName);
    const endpoint = getEndpointForType(config, endpointType, matchId);

    // Try 1: Firebase key with its configured host
    try {
      const result = await tryApiCall(endpoint, fb.apiKey, fb.apiHost);
      if (result) {
        console.log(`[API] Firebase key SUCCESS (provider: ${providerName})`);
        return { data: result, providerName };
      }
      console.log('[API] Firebase key returned empty/invalid on configured host');
    } catch (e: any) {
      console.log(`[API] Firebase key FAILED on ${fb.apiHost}: ${e?.message || 'unknown'}`);
    }

    // Try 2: If Firebase host is NOT HOST_1, retry Firebase key on HOST_1 (cricbuzz-cricket)
    // This handles the case where key is subscribed to cricbuzz-cricket but stored with a different host
    if (fb.apiHost !== HOST_1) {
      const fallbackConfig = PROVIDERS[DEFAULT_PROVIDER];
      const fallbackEndpoint = getEndpointForType(fallbackConfig, endpointType, matchId);
      try {
        const result = await tryApiCall(fallbackEndpoint, fb.apiKey, HOST_1);
        if (result) {
          console.log(`[API] Firebase key SUCCESS on HOST_1 fallback`);
          return { data: result, providerName: DEFAULT_PROVIDER };
        }
      } catch (e: any) {
        console.log(`[API] Firebase key also FAILED on HOST_1: ${e?.message || 'unknown'}`);
      }
    }
  } else {
    console.log('[API] Firebase unavailable or timed out, switching to fallback');
  }

  // ===== PRIORITY 2: User Custom API Key =====
  const userKey = await getUserApiKey();
  if (userKey) {
    const config = PROVIDERS[DEFAULT_PROVIDER];
    const endpoint = getEndpointForType(config, endpointType, matchId);
    try {
      const result = await tryApiCall(endpoint, userKey, HOST_1);
      if (result) {
        console.log('[API] User custom key SUCCESS');
        return { data: result, providerName: DEFAULT_PROVIDER };
      }
    } catch {
      console.log('[API] User custom key failed, trying hardcoded keys');
    }
  }

  // ===== PRIORITY 3: Random rotation of ALL 25 hardcoded keys on HOST_1 =====
  // HOST_1 (cricbuzz-cricket.p.rapidapi.com) is the primary and most reliable host.
  // HOST_2 (free-cricbuzz-cricket) has different/unknown endpoints, so HOST_1 is prioritized.
  console.log('[API] Using hardcoded key rotation (random) on HOST_1');
  const fallbackCricbuzzConfig = PROVIDERS[DEFAULT_PROVIDER];
  const fallbackEndpoint = getEndpointForType(fallbackCricbuzzConfig, endpointType, matchId);

  const shuffledKeys = shuffleArray(MATCH_KEYS);
  for (let i = 0; i < Math.min(15, shuffledKeys.length); i++) {
    const key = shuffledKeys[i];

    // Try with Host 1 (cricbuzz-cricket.p.rapidapi.com) - primary
    try {
      const result = await tryApiCall(fallbackEndpoint, key, HOST_1);
      if (result) {
        console.log(`[API] Hardcoded key #${i} SUCCESS on HOST_1`);
        return { data: result, providerName: 'cricbuzz-cricket' };
      }
    } catch {}
  }

  console.log('[API] ALL keys exhausted for:', endpointType);
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
// Used by both cricbuzz-cricket and free-cricbuzz-cricket providers.
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

// ============ CRICKET LIVE DATA TRANSFORMATION ============
// Used by cricket-live-data provider (different JSON format)

function classifyStateCricketLiveData(status?: string): 'live' | 'recent' | 'upcoming' {
  if (!status) return 'upcoming';
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('result') || s.includes('ended') || s.includes('won') || s.includes('draw') || s.includes('tied')) return 'recent';
  if (s.includes('upcoming') || s.includes('scheduled') || s.includes('not started') || s.includes('preview')) return 'upcoming';
  return 'live'; // In Progress, Live, etc.
}

function extractAllCricketLiveData(data: any): Match[] {
  // Cricket Live Data returns { results: [...] } or { fixtures: [...] } or { matches: [...] }
  const matches = data?.results || data?.fixtures || data?.matches || [];
  if (!Array.isArray(matches)) return [];

  return matches.map((m: any): Match => {
    const homeScoreRaw = m.home?.scores || m.home?.score || m.team_a_scores || '';
    const awayScoreRaw = m.away?.scores || m.away?.score || m.team_b_scores || '';

    // Parse "150/3 (18.2)" style scores
    const parseScore = (raw: string) => {
      if (!raw) return {};
      const match = String(raw).match(/(\d+)(?:\/(\d+))?(?:\s*\((\d+\.?\d*)\s*\))?/);
      if (!match) return {};
      return {
        runs: match[1] ? parseInt(match[1]) : undefined,
        wickets: match[2] ? parseInt(match[2]) : undefined,
        overs: match[3] ? parseFloat(match[3]) : undefined,
      };
    };

    const homeScore = parseScore(homeScoreRaw);
    const awayScore = parseScore(awayScoreRaw);

    return {
      matchId: String(m.id || m.match_id || m.matchId || ''),
      seriesName: m.series || m.tournament || m.league || '',
      matchDesc: m.match_title || m.title || m.description || '',
      matchType: m.match_type || m.format || m.type || '',
      status: classifyStateCricketLiveData(m.status || m.match_status || m.state),
      statusText: m.status_note || m.result || m.status_str || m.status || '',
      venue: m.venue?.name || m.venue || '',
      city: m.venue?.location || m.venue?.city || '',
      startTime: m.date || m.datetime || m.start_date || '',
      teams: [
        {
          name: m.home?.name || m.team_a || m.home_team || '?',
          shortName: m.home?.code || m.team_a_short || m.home_team_short || '?',
          runs: homeScore.runs,
          wickets: homeScore.wickets,
          overs: homeScore.overs,
        },
        {
          name: m.away?.name || m.team_b || m.away_team || '?',
          shortName: m.away?.code || m.team_b_short || m.away_team_short || '?',
          runs: awayScore.runs,
          wickets: awayScore.wickets,
          overs: awayScore.overs,
        },
      ],
    };
  });
}

function transformDetailCricketLiveData(raw: any): Match {
  const m = raw?.match || raw?.data || raw;
  return {
    matchId: String(m.id || m.match_id || ''),
    seriesName: m.series || m.tournament || '',
    matchDesc: m.match_title || m.title || '',
    matchType: m.match_type || m.format || '',
    status: classifyStateCricketLiveData(m.status || m.match_status),
    statusText: m.status_note || m.result || m.status_str || '',
    venue: m.venue?.name || m.venue || '',
    city: m.venue?.location || '',
    teams: [
      { name: m.home?.name || m.team_a || '?', shortName: m.home?.code || m.team_a_short || '?' },
      { name: m.away?.name || m.team_b || '?', shortName: m.away?.code || m.team_b_short || '?' },
    ],
  };
}

function parseCommentaryCricketLiveData(data: any, matchId: string): Commentary[] {
  // Cricket Live Data may not have ball-by-ball commentary
  // Parse from scorecard or commentary array if available
  const balls = data?.scorecard?.balls || data?.commentary || data?.ball_by_ball || [];
  if (!Array.isArray(balls)) return [];

  return balls.map((b: any, i: number): Commentary => ({
    id: `${matchId}-cld-${i}`,
    over: String(b.over || b.ball || b.overNumber || '0.0'),
    english: b.text || b.description || b.comment || b.commText || '',
    event: mapEventCricketLiveData(b.event || b.type || b.event_type),
    runs: b.runs !== undefined ? Number(b.runs) : undefined,
  })).filter((c: Commentary) => c.english);
}

function mapEventCricketLiveData(e?: string): Commentary['event'] {
  if (!e) return 'normal';
  const s = e.toLowerCase();
  if (s.includes('wicket') || s.includes('out')) return 'wicket';
  if (s.includes('six')) return 'six';
  if (s.includes('four') || s.includes('boundary')) return 'four';
  if (s.includes('wide')) return 'wide';
  if (s.includes('dot')) return 'dot';
  return 'normal';
}

// ============ CRICBUZZ COMMENTARY PARSING ============
// comwrapper[i].commentary is a SINGLE DICT (one ball), not a list!

function cleanText(raw: string): string {
  if (!raw) return '';
  let t = raw.replace(/[A-Z]\d+\$,?\s*/g, '');
  t = t.replace(/^[\s,]+|[\s,]+$/g, '');
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
        if (text) {
          out.push({
            id: `${matchId}-${i}`,
            over: String(c.overnum ?? c.overNumber ?? '0.0'),
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
          if (text) {
            out.push({
              id: `${matchId}-${i}-${j}`,
              over: String(c[j].overnum ?? c[j].overNumber ?? '0.0'),
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
      if (text) {
        out.push({
          id: `${matchId}-cl-${i}`,
          over: String(c.overNumber ?? c.overnum ?? '0.0'),
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
    // Cache the match data (30 second TTL for live updates)
    await setCache(`match_${id}`, match);
  }

  return match;
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
