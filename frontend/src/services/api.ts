import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking } from 'react-native';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || '';

// Keys ordered: WORKING keys first (subscribed to /comm), then others
const RAPIDAPI_KEYS = [
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",  // WORKS for comm
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",  // WORKS for comm
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

let keyIdx = 0;

const nextKey = () => {
  const k = RAPIDAPI_KEYS[keyIdx];
  keyIdx = (keyIdx + 1) % RAPIDAPI_KEYS.length;
  return k;
};

const apiCall = async (endpoint: string, retries = 5): Promise<any> => {
  let lastErr: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(`https://${HOST}${endpoint}`, {
        headers: { 'X-RapidAPI-Key': nextKey(), 'X-RapidAPI-Host': HOST },
        timeout: 12000,
      });
      if (res.data && !res.data.message) return res.data;
      // If message like "not subscribed" or "quota exceeded", try next key
      if (res.data?.message) {
        lastErr = new Error(res.data.message);
        continue;
      }
    } catch (err: any) {
      lastErr = err;
      continue;
    }
  }
  throw lastErr || new Error('All keys failed');
};

// Commentary-specific call: only uses first 2 keys (subscribed)
const commApiCall = async (endpoint: string): Promise<any> => {
  const commKeys = RAPIDAPI_KEYS.slice(0, 2);
  for (const key of commKeys) {
    try {
      const res = await axios.get(`https://${HOST}${endpoint}`, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
        timeout: 12000,
      });
      if (res.data && !res.data.message) return res.data;
    } catch (err) {
      continue;
    }
  }
  // Fallback: try remaining keys
  for (let i = 2; i < RAPIDAPI_KEYS.length; i++) {
    try {
      const res = await axios.get(`https://${HOST}${endpoint}`, {
        headers: { 'X-RapidAPI-Key': RAPIDAPI_KEYS[i], 'X-RapidAPI-Host': HOST },
        timeout: 12000,
      });
      if (res.data && !res.data.message) return res.data;
    } catch (err) {
      continue;
    }
  }
  throw new Error('Commentary API failed with all keys');
};

// Get field value handling both camelCase and lowercase
const g = (obj: any, ...keys: string[]): any => {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
};

function formatTs(ts?: number | string): string {
  if (!ts) return '';
  try {
    const d = new Date(typeof ts === 'string' ? parseInt(ts, 10) : ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

function getStatus(state: string): 'live' | 'recent' | 'upcoming' {
  const s = (state || '').toLowerCase();
  if (s.includes('complete') || s.includes('result') || s.includes('abandon')) return 'recent';
  if (s.includes('progress') || s.includes('toss') || s.includes('innings break') ||
      s.includes('stumps') || s.includes('strategic') || s.includes('delay') ||
      s.includes('rain') || s.includes('drinks') || s.includes('lunch') ||
      s.includes('tea') || s.includes('dinner')) return 'live';
  if (s.includes('preview') || s === '' || s === 'upcoming') return 'upcoming';
  return 'upcoming';
}

function transformMatch(m: any): Match {
  const info = m.matchInfo || m;
  const score = m.matchScore || {};

  const state = g(info, 'state', 'State') || '';
  const t1 = g(info, 'team1', 'Team1') || {};
  const t2 = g(info, 'team2', 'Team2') || {};

  const t1Score = g(score, 'team1Score') || {};
  const t2Score = g(score, 'team2Score') || {};
  const t1Inn = g(t1Score, 'inngs1') || {};
  const t2Inn = g(t2Score, 'inngs1') || {};

  const venue = g(info, 'venueInfo', 'venueinfo') || {};

  return {
    matchId: String(g(info, 'matchId', 'matchid') || ''),
    seriesName: g(info, 'seriesName', 'seriesname') || 'Series',
    matchDesc: g(info, 'matchDesc', 'matchdesc') || '',
    matchType: g(info, 'matchFormat', 'matchformat') || 'T20',
    status: getStatus(state),
    statusText: g(info, 'status', 'stateTitle', 'statetitle') || '',
    venue: g(venue, 'ground', 'Ground') || '',
    city: g(venue, 'city', 'City') || '',
    startTime: formatTs(g(info, 'startDate', 'startdate', 'matchStartTimestamp', 'matchstarttimestamp')),
    startDate: g(info, 'startDt', 'startdt') || '',
    teams: [
      {
        name: g(t1, 'teamName', 'teamname') || 'Team 1',
        shortName: g(t1, 'teamSName', 'teamsname') || 'TM1',
        runs: t1Inn.runs,
        wickets: t1Inn.wickets,
        overs: t1Inn.overs,
      },
      {
        name: g(t2, 'teamName', 'teamname') || 'Team 2',
        shortName: g(t2, 'teamSName', 'teamsname') || 'TM2',
        runs: t2Inn.runs,
        wickets: t2Inn.wickets,
        overs: t2Inn.overs,
      },
    ],
  };
}

function extractMatches(data: any): Match[] {
  const out: Match[] = [];
  if (!data?.typeMatches) return out;
  for (const t of data.typeMatches) {
    for (const s of (t.seriesMatches || [])) {
      const sw = s.seriesAdWrapper || s;
      for (const m of (sw.matches || [])) {
        if (m.matchInfo) out.push(transformMatch(m));
      }
    }
  }
  return out;
}

// ===== PUBLIC FETCH FUNCTIONS =====

export async function fetchLiveMatches(): Promise<Match[]> {
  try {
    const data = await apiCall('/matches/v1/live');
    const all = extractMatches(data);
    // STRICT FILTER: only truly live matches
    return all.filter(m => m.status === 'live');
  } catch { return []; }
}

export async function fetchRecentMatches(): Promise<Match[]> {
  try {
    const data = await apiCall('/matches/v1/recent');
    const all = extractMatches(data);
    return all.filter(m => m.status === 'recent');
  } catch { return []; }
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  try {
    const data = await apiCall('/matches/v1/upcoming');
    const all = extractMatches(data);
    return all.filter(m => m.status === 'upcoming');
  } catch { return []; }
}

// ===== EVENT MAPPING =====

function mapEvent(e?: string): 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' {
  if (!e) return 'normal';
  const s = e.toLowerCase();
  if (s.includes('wicket') || s.includes('out') || s === 'w') return 'wicket';
  if (s.includes('six') || s === '6s') return 'six';
  if (s.includes('four') || s.includes('boundary') || s === '4s') return 'four';
  if (s.includes('wide') || s === 'wd') return 'wide';
  if (s === 'none' || s === '0' || s.includes('dot')) return 'dot';
  return 'normal';
}

function cleanText(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[A-Z]\d+\$,?\s*/g, '').replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

// ===== COMMENTARY PARSING =====
// Cricbuzz /comm returns comwrapper[] where EACH item has commentary as a DICT (single ball)

function parseCommentary(data: any, matchId: string): Commentary[] {
  if (!data) return [];
  const out: Commentary[] = [];

  // Format 1: comwrapper (direct API - each item.commentary is a DICT)
  const cw = data.comwrapper || [];
  if (Array.isArray(cw) && cw.length > 0) {
    for (let i = 0; i < cw.length; i++) {
      const wrapper = cw[i];
      const c = wrapper?.commentary;
      if (!c || typeof c !== 'object') continue;

      // Each c is a single commentary dict
      if (c.commtxt !== undefined || c.commText !== undefined) {
        let text = cleanText(c.commtxt || c.commText || '');
        if (!text) continue;

        out.push({
          id: `${matchId}-${i}`,
          over: String(c.overnum ?? c.overNumber ?? '0.0'),
          english: text,
          event: mapEvent(c.eventtype || c.event || 'NONE'),
        });
      }
      // If c is actually a LIST (some API versions)
      else if (Array.isArray(c)) {
        for (let j = 0; j < c.length; j++) {
          const item = c[j];
          let text = cleanText(item?.commtxt || item?.commText || '');
          if (!text) continue;
          out.push({
            id: `${matchId}-${i}-${j}`,
            over: String(item.overnum ?? item.overNumber ?? '0.0'),
            english: text,
            event: mapEvent(item.eventtype || item.event || 'NONE'),
          });
        }
      }
    }
    if (out.length > 0) return out;
  }

  // Format 2: commentaryList at root (backend proxy response)
  const cl = data.commentaryList;
  if (Array.isArray(cl) && cl.length > 0) {
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i];
      let text = cleanText(c?.commText || c?.commtxt || '');
      if (!text) continue;
      out.push({
        id: `${matchId}-cl-${i}`,
        over: String(c.overNumber ?? c.overnum ?? '0.0'),
        english: text,
        event: mapEvent(c.event || c.eventtype || 'NONE'),
      });
    }
  }

  return out;
}

// ===== FETCH MATCH BY ID =====

export async function fetchMatchById(id: string): Promise<Match | null> {
  let match: Match | null = null;
  let commentary: Commentary[] = [];

  // Step 1: Fetch match info
  try {
    const raw = await apiCall(`/mcenter/v1/${id}`, 3);
    if (raw) {
      // Direct match detail returns flat structure with lowercase keys
      const info = raw.matchInfo || raw;
      const t1 = g(info, 'team1', 'Team1') || {};
      const t2 = g(info, 'team2', 'Team2') || {};
      const venue = g(info, 'venueInfo', 'venueinfo') || {};
      const state = g(info, 'state', 'State') || '';

      match = {
        matchId: id,
        seriesName: g(info, 'seriesName', 'seriesname') || 'Match',
        matchDesc: g(info, 'matchDesc', 'matchdesc') || '',
        matchType: g(info, 'matchFormat', 'matchformat') || '',
        status: getStatus(state),
        statusText: g(info, 'status') || '',
        venue: g(venue, 'ground') || '',
        city: g(venue, 'city') || '',
        teams: [
          {
            name: g(t1, 'teamName', 'teamname') || 'Team 1',
            shortName: g(t1, 'teamSName', 'teamsname') || 'TM1',
          },
          {
            name: g(t2, 'teamName', 'teamname') || 'Team 2',
            shortName: g(t2, 'teamSName', 'teamsname') || 'TM2',
          },
        ],
      };

      // Scores from matchScore
      const ms = raw.matchScore || {};
      const t1s = ms.team1Score?.inngs1;
      const t2s = ms.team2Score?.inngs1;
      if (t1s) { match.teams[0].runs = t1s.runs; match.teams[0].wickets = t1s.wickets; match.teams[0].overs = t1s.overs; }
      if (t2s) { match.teams[1].runs = t2s.runs; match.teams[1].wickets = t2s.wickets; match.teams[1].overs = t2s.overs; }
    }
  } catch (err) {
    console.warn('Match info failed:', err);
  }

  // Step 2: Fetch commentary (use commApiCall for subscribed keys)
  try {
    const commData = await commApiCall(`/mcenter/v1/${id}/comm`);
    if (commData) {
      commentary = parseCommentary(commData, id);

      // Extract team info from matchheaders if match is null
      const mh = commData.matchheaders || commData.matchHeader || {};
      if (mh) {
        const t1h = g(mh, 'team1') || {};
        const t2h = g(mh, 'team2') || {};
        const state = g(mh, 'state', 'State') || '';

        // Use teamdetails if available
        const td = mh.teamdetails || {};

        if (!match) {
          match = {
            matchId: id,
            seriesName: g(mh, 'seriesName', 'seriesname') || 'Match',
            matchDesc: g(mh, 'matchDesc', 'matchdesc') || '',
            status: getStatus(state),
            statusText: g(mh, 'status') || '',
            teams: [
              { name: g(t1h, 'teamName', 'teamname') || 'Team 1', shortName: g(t1h, 'teamSName', 'teamsname') || 'TM1' },
              { name: g(t2h, 'teamName', 'teamname') || 'Team 2', shortName: g(t2h, 'teamSName', 'teamsname') || 'TM2' },
            ],
          };
        }

        // Update team names from matchheaders if still defaults
        if (match.teams[0].shortName === 'TM1' && g(t1h, 'teamsname')) {
          match.teams[0].name = g(t1h, 'teamname') || match.teams[0].name;
          match.teams[0].shortName = g(t1h, 'teamsname') || match.teams[0].shortName;
        }
        if (match.teams[1].shortName === 'TM2' && g(t2h, 'teamsname')) {
          match.teams[1].name = g(t2h, 'teamname') || match.teams[1].name;
          match.teams[1].shortName = g(t2h, 'teamsname') || match.teams[1].shortName;
        }
      }

      // Extract scores from miniscore
      const ms = commData.miniscore || {};
      if (ms && match) {
        const batTeam = ms.batTeam || ms.batteam || {};
        const batShort = g(batTeam, 'teamSName', 'teamsname');
        if (batShort) {
          const idx = match.teams.findIndex(t => t.shortName === batShort);
          if (idx >= 0) {
            const bts = ms.batTeamScore || ms.batteamscore || {};
            match.teams[idx].runs = bts.runs ?? match.teams[idx].runs;
            match.teams[idx].wickets = bts.wickets ?? match.teams[idx].wickets;
            match.teams[idx].overs = ms.overs ?? match.teams[idx].overs;
          }
        }
      }
    }
  } catch (commErr) {
    console.warn('Commentary fetch failed:', commErr);
  }

  if (match) {
    match.commentary = commentary;
  }

  return match;
}

export const openCricbuzzMatch = async (matchId: string) => {
  try {
    await Linking.openURL(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`);
  } catch (err) {
    console.warn('Failed to open Cricbuzz:', err);
  }
};
