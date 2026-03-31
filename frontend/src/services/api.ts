import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ API KEY MANAGEMENT ============
const API_KEY_STORAGE = 'cricapp_user_api_key';

// Keys 0,1 are SUBSCRIBED to /comm endpoint. Others only work for /matches.
const COMM_KEYS = [
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
];

const MATCH_KEYS = [
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
];

const HOST = "cricbuzz-cricket.p.rapidapi.com";
let matchKeyIdx = 0;
let commKeyIdx = 0;

// Get user's custom API key (if set)
async function getUserApiKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(API_KEY_STORAGE);
  } catch {
    return null;
  }
}

// ============ API CALL HELPERS ============
async function callApi(endpoint: string, keys: string[], maxTries: number = 5): Promise<any> {
  // First try user's custom API key if available
  const userKey = await getUserApiKey();
  if (userKey) {
    try {
      const res = await axios.get(`https://${HOST}${endpoint}`, {
        headers: { 'X-RapidAPI-Key': userKey, 'X-RapidAPI-Host': HOST },
        timeout: 12000,
      });
      if (res.data && !res.data.message) return res.data;
    } catch (e) {
      // User key failed, continue with default keys
      console.log('[API] User key failed, trying default keys');
    }
  }

  // Try default keys
  for (let i = 0; i < Math.min(maxTries, keys.length); i++) {
    const idx = (endpoint.includes('/comm') ? commKeyIdx++ : matchKeyIdx++) % keys.length;
    try {
      const res = await axios.get(`https://${HOST}${endpoint}`, {
        headers: { 'X-RapidAPI-Key': keys[idx % keys.length], 'X-RapidAPI-Host': HOST },
        timeout: 12000,
      });
      if (res.data && !res.data.message) return res.data;
    } catch (e) { continue; }
  }
  return null;
}

// ============ CACHE HELPERS ============
const CACHE_TTL = 60000; // 1 minute cache

async function getCached(key: string): Promise<any> {
  try {
    const raw = await AsyncStorage.getItem(`cricapp_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

async function setCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(`cricapp_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

// ============ MATCH TRANSFORMATION ============
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
function transformDetailMatch(raw: any): Match {
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

// Extract matches from nested API structure (handles ALL depth levels)
function extractAll(data: any): Match[] {
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

// ============ PUBLIC: FETCH MATCH LISTS ============

export async function fetchLiveMatches(): Promise<Match[]> {
  // Check cache first
  const cached = await getCached('live');
  if (cached) return cached;

  const data = await callApi('/matches/v1/live', MATCH_KEYS, 5);
  if (!data) return [];
  const all = extractAll(data);
  // STRICT: Only matches that are NOT complete and NOT preview
  const live = all.filter(m => m.status === 'live');
  await setCache('live', live);
  return live;
}

export async function fetchRecentMatches(): Promise<Match[]> {
  const cached = await getCached('recent');
  if (cached) return cached;

  const data = await callApi('/matches/v1/recent', MATCH_KEYS, 5);
  if (!data) return [];
  const all = extractAll(data);
  const recent = all.filter(m => m.status === 'recent');
  await setCache('recent', recent);
  return recent;
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  const cached = await getCached('upcoming');
  if (cached) return cached;

  const data = await callApi('/matches/v1/upcoming', MATCH_KEYS, 5);
  if (!data) return [];
  const all = extractAll(data);
  const upcoming = all.filter(m => m.status === 'upcoming');
  await setCache('upcoming', upcoming);
  return upcoming;
}

// ============ COMMENTARY PARSING ============
// comwrapper[i].commentary is a SINGLE DICT (one ball), not a list!

function cleanText(raw: string): string {
  if (!raw) return '';
  let t = raw.replace(/[A-Z]\d+\$,?\s*/g, '');
  t = t.replace(/^[\s,]+|[\s,]+$/g, '');
  return t.trim();
}

function mapEvent(e?: string): Commentary['event'] {
  if (!e) return 'normal';
  const s = e.toLowerCase();
  if (s.includes('wicket') || s.includes('out') || s === 'w') return 'wicket';
  if (s.includes('six') || s === '6s') return 'six';
  if (s.includes('four') || s.includes('boundary') || s === '4s') return 'four';
  if (s.includes('wide') || s === 'wd') return 'wide';
  if (s === 'none' || s === '0' || s.includes('dot')) return 'dot';
  return 'normal';
}

function parseCommentary(data: any, matchId: string): Commentary[] {
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
        });
      }
    }
  }

  return out;
}

// ============ FETCH MATCH BY ID ============

export async function fetchMatchById(id: string): Promise<Match | null> {
  let match: Match | null = null;
  let commentary: Commentary[] = [];

  // 1. Get match info from /mcenter/v1/{id} (flat lowercase structure)
  try {
    const raw = await callApi(`/mcenter/v1/${id}`, MATCH_KEYS, 4);
    if (raw && !raw.message) {
      match = transformDetailMatch(raw);
    }
  } catch {}

  // 2. Get commentary from /mcenter/v1/{id}/comm (try ALL comm keys)
  try {
    const commData = await callApi(`/mcenter/v1/${id}/comm`, COMM_KEYS, COMM_KEYS.length);
    if (commData && !commData.message) {
      commentary = parseCommentary(commData, id);

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

        // Always prefer commentary matchheaders status (it has actual result)
        if (mh.status) {
          match.statusText = mh.status;
        }
        if (mh.state) {
          match.status = classifyState(mh.state);
        }
      }
    }
  } catch {}

  if (match) {
    match.commentary = commentary;
  }

  return match;
}

// ============ DEEP LINK ============

export const openCricbuzzMatch = (matchId: string) => {
  Alert.alert(
    'External Link',
    'You will be redirected to Cricbuzz website. Do you want to continue?',
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
