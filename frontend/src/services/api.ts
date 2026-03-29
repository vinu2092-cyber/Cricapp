import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking } from 'react-native';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || 'https://scoreboard-pro-21.preview.emergentagent.com';

const RAPIDAPI_KEYS = [
  "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",
  "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
  "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
  "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
  "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
  "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
  "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
];

const RAPIDAPI_HOSTS = [
  "cricbuzz-cricket.p.rapidapi.com",
  "cricbuzz.p.rapidapi.com",
];

let currentKeyIndex = 0;
let currentHostIndex = 0;

const backendClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: 8000,
});

const getDirectClient = () => {
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  const host = RAPIDAPI_HOSTS[currentHostIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  if (currentKeyIndex % 5 === 0) {
    currentHostIndex = (currentHostIndex + 1) % RAPIDAPI_HOSTS.length;
  }
  return axios.create({
    baseURL: `https://${host}`,
    timeout: 12000,
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
  });
};

const directApiCall = async (endpoint: string, retries = 4): Promise<any> => {
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const client = getDirectClient();
      const res = await client.get(endpoint);
      if (res.data) return res.data;
    } catch (err: any) {
      lastError = err;
      if (err?.response?.status === 429 || err?.response?.status === 403) {
        continue;
      }
    }
  }
  throw lastError || new Error('All API keys exhausted');
};

function formatTimestamp(ts?: number | string): string {
  if (!ts) return '';
  try {
    const date = new Date(typeof ts === 'string' ? parseInt(ts, 10) : ts);
    if (isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    };
    return date.toLocaleDateString('en-IN', options);
  } catch {
    return '';
  }
}

const transformToMatch = (m: any, defaultStatus?: 'live' | 'recent' | 'upcoming'): Match => {
  const info = m.matchInfo || m;
  const score = m.matchScore || {};
  const state = (info.state || '').toLowerCase();

  // Use API endpoint context as primary status indicator
  let status: 'live' | 'recent' | 'upcoming' = defaultStatus || 'upcoming';
  if (state.includes('complete') || state.includes('result')) {
    status = 'recent';
  } else if (state.includes('progress') || state.includes('toss') || state.includes('innings break') || state.includes('strategic') || state.includes('delay') || state.includes('stumps') || state.includes('rain') || state.includes('drinks') || state.includes('lunch') || state.includes('tea') || state.includes('dinner')) {
    status = 'live';
  }

  // Extract start time for upcoming matches
  let startTime = '';
  let startDate = '';
  if (info.startDate) {
    startTime = formatTimestamp(info.startDate);
    startDate = startTime;
  } else if (info.startDt) {
    startTime = info.startDt;
    startDate = info.startDt;
  }

  return {
    matchId: String(info.matchId),
    seriesName: info.seriesName || 'Series',
    matchDesc: info.matchDesc || '',
    matchType: info.matchFormat || 'T20',
    status,
    statusText: info.status || info.stateTitle || '',
    venue: info.venueInfo?.ground || '',
    city: info.venueInfo?.city || '',
    startTime,
    startDate,
    teams: [
      {
        name: info.team1?.teamName || 'Team 1',
        shortName: info.team1?.teamSName || 'TM1',
        runs: score.team1Score?.inngs1?.runs,
        wickets: score.team1Score?.inngs1?.wickets,
        overs: score.team1Score?.inngs1?.overs,
      },
      {
        name: info.team2?.teamName || 'Team 2',
        shortName: info.team2?.teamSName || 'TM2',
        runs: score.team2Score?.inngs1?.runs,
        wickets: score.team2Score?.inngs1?.wickets,
        overs: score.team2Score?.inngs1?.overs,
      },
    ],
  };
};

function extract(data: any, defaultStatus?: 'live' | 'recent' | 'upcoming'): Match[] {
  const matches: Match[] = [];
  if (!data?.typeMatches) return matches;
  data.typeMatches.forEach((t: any) => {
    t.seriesMatches?.forEach((s: any) => {
      s.seriesAdWrapper?.matches?.forEach((m: any) => {
        if (m.matchInfo) matches.push(transformToMatch(m, defaultStatus));
      });
    });
  });
  return matches;
}

// Try backend first, fallback to direct API
async function fetchWithFallback(
  backendEndpoint: string,
  directEndpoint: string,
  defaultStatus: 'live' | 'recent' | 'upcoming'
): Promise<Match[]> {
  // Try backend proxy first
  try {
    const res = await backendClient.get(`/api${backendEndpoint}`);
    if (res.data) {
      const matches = extract(res.data, defaultStatus);
      if (matches.length > 0) return matches;
    }
  } catch (backendErr) {
    // Backend failed
  }

  // Fallback: Direct RapidAPI
  try {
    const data = await directApiCall(directEndpoint, 4);
    return extract(data || {}, defaultStatus);
  } catch (directErr) {
    console.error('Direct API also failed:', directErr);
    return [];
  }
}

// NO strict filtering - trust the API endpoint
export async function fetchLiveMatches(): Promise<Match[]> {
  return fetchWithFallback('/cricket/matches/live', '/matches/v1/live', 'live');
}

export async function fetchRecentMatches(): Promise<Match[]> {
  return fetchWithFallback('/cricket/matches/recent', '/matches/v1/recent', 'recent');
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  return fetchWithFallback('/cricket/matches/upcoming', '/matches/v1/upcoming', 'upcoming');
}

function mapEvent(event?: string): 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' {
  if (!event) return 'normal';
  const e = event.toLowerCase();
  if (e.includes('wicket') || e.includes('out') || e === 'w') return 'wicket';
  if (e.includes('six') || e === 'SIX' || e === '6s') return 'six';
  if (e.includes('four') || e.includes('boundary') || e === 'FOUR' || e === '4s') return 'four';
  if (e.includes('wide') || e === 'wd') return 'wide';
  if (e.includes('dot') || e === 'none' || e === '0' || e === 'NONE') return 'dot';
  return 'normal';
}

// Clean format markers from commentary text
function cleanCommText(raw: string): string {
  if (!raw) return '';
  // Remove format markers like "B0$", "I0$", etc.
  let text = raw.replace(/[A-Z]\d+\$,?\s*/g, '');
  // Remove leading/trailing whitespace and commas
  text = text.replace(/^[,\s]+|[,\s]+$/g, '');
  return text.trim();
}

// Parse commentary from ALL possible Cricbuzz response formats
function parseRawCommentary(rawData: any, matchId: string): Commentary[] {
  if (!rawData) return [];
  const commentary: Commentary[] = [];

  // Format 1: commentaryList at root (most common from backend proxy + direct API)
  const commList = rawData.commentaryList;
  if (Array.isArray(commList) && commList.length > 0) {
    for (let i = 0; i < commList.length; i++) {
      const c = commList[i];
      if (!c || typeof c !== 'object') continue;

      // Extract text from multiple possible fields
      let text = '';

      // Try commText first (normalized field)
      if (c.commText && typeof c.commText === 'string' && !c.commText.startsWith('I0$')) {
        text = c.commText;
      }
      // Try commtxt (raw field)
      else if (c.commtxt && typeof c.commtxt === 'string') {
        text = cleanCommText(c.commtxt);
      }
      // Try commentaryFormats
      if (!text && c.commentaryFormats) {
        const formats = Array.isArray(c.commentaryFormats) ? c.commentaryFormats : [c.commentaryFormats];
        for (const fmt of formats) {
          const values = fmt?.value || [];
          for (const v of values) {
            if (v && typeof v === 'object' && v.value && typeof v.value === 'string') {
              text = v.value;
              break;
            }
          }
          if (text) break;
        }
      }

      // Clean and skip empty
      text = cleanCommText(text);
      if (!text) continue;

      const overNum = c.overNumber ?? c.overNum ?? c.overnum ?? c.over ?? '0.0';
      const eventType = c.event || c.eventType || c.eventtype || 'NONE';

      commentary.push({
        id: `${matchId}-${i}`,
        over: String(overNum),
        english: text,
        event: mapEvent(eventType),
      });
    }

    if (commentary.length > 0) return commentary;
  }

  // Format 2: commentary inside comwrapper (older API format)
  if (rawData.comwrapper) {
    const wrappers = Array.isArray(rawData.comwrapper) ? rawData.comwrapper : [rawData.comwrapper];
    for (const wrapper of wrappers) {
      const commArr = wrapper?.commentary;
      if (!Array.isArray(commArr)) continue;
      for (let i = 0; i < commArr.length; i++) {
        const c = commArr[i];
        if (!c || typeof c !== 'object') continue;

        let text = c.commtxt || c.commText || '';
        text = cleanCommText(text);
        if (!text) continue;

        commentary.push({
          id: `${matchId}-cw-${i}`,
          over: String(c.overnum ?? c.overNumber ?? '0.0'),
          english: text,
          event: mapEvent(c.eventtype || c.event || 'NONE'),
        });
      }
    }
  }

  return commentary;
}

export async function fetchMatchById(id: string): Promise<Match | null> {
  let match: Match | null = null;
  let commentary: Commentary[] = [];

  // Strategy 1: Direct API for match info (more reliable than backend proxy)
  try {
    const matchData = await directApiCall(`/mcenter/v1/${id}`, 3);
    if (matchData) {
      const info = matchData.matchInfo || matchData;
      match = transformToMatch(matchData);
      match.matchId = id;
      match.seriesName = info?.seriesName || match.seriesName;
      match.venue = info?.venueInfo?.ground || match.venue;
      match.city = info?.venueInfo?.city || '';
      match.statusText = info?.status || match.statusText;

      if (info?.team1) {
        match.teams[0].name = info.team1.teamName || match.teams[0].name;
        match.teams[0].shortName = info.team1.teamSName || match.teams[0].shortName;
      }
      if (info?.team2) {
        match.teams[1].name = info.team2.teamName || match.teams[1].name;
        match.teams[1].shortName = info.team2.teamSName || match.teams[1].shortName;
      }

      const ms = matchData.matchScore;
      if (ms) {
        if (ms.team1Score?.inngs1) {
          match.teams[0].runs = ms.team1Score.inngs1.runs;
          match.teams[0].wickets = ms.team1Score.inngs1.wickets;
          match.teams[0].overs = ms.team1Score.inngs1.overs;
        }
        if (ms.team2Score?.inngs1) {
          match.teams[1].runs = ms.team2Score.inngs1.runs;
          match.teams[1].wickets = ms.team2Score.inngs1.wickets;
          match.teams[1].overs = ms.team2Score.inngs1.overs;
        }
      }
    }
  } catch (err) {
    console.warn('Direct match info failed:', err);
  }

  // Strategy 2: Direct API for commentary
  try {
    const commData = await directApiCall(`/mcenter/v1/${id}/comm`, 3);
    if (commData) {
      commentary = parseRawCommentary(commData, id);

      // Also extract scores from miniscore in comm response
      const ms = commData.miniscore || {};
      if (ms.batTeam && match) {
        // Update batting team score
        const batShort = ms.batTeam?.teamSName;
        const teamIdx = match.teams.findIndex(t => t.shortName === batShort);
        if (teamIdx >= 0 && ms.batTeamScore) {
          match.teams[teamIdx].runs = ms.batTeamScore.runs ?? match.teams[teamIdx].runs;
          match.teams[teamIdx].wickets = ms.batTeamScore.wickets ?? match.teams[teamIdx].wickets;
          match.teams[teamIdx].overs = ms.overs ?? match.teams[teamIdx].overs;
        }
      }

      // Extract from matchheader if match is still null
      if (!match && commData.matchHeader) {
        const mh = commData.matchHeader;
        match = {
          matchId: id,
          status: (mh.state || '').toLowerCase().includes('progress') ? 'live' : 'recent',
          seriesName: mh.seriesName || 'Match',
          statusText: mh.status || '',
          teams: [
            { name: mh.team1?.name || 'Team 1', shortName: mh.team1?.shortName || 'TM1' },
            { name: mh.team2?.name || 'Team 2', shortName: mh.team2?.shortName || 'TM2' },
          ],
          commentary,
        };
      }
    }
  } catch (commErr) {
    console.warn('Direct commentary fetch failed:', commErr);
  }

  // Strategy 3: Backend proxy as last resort
  if (!match || commentary.length === 0) {
    try {
      const commRes = await backendClient.get(`/api/cricket/match/${id}/commentary`);
      const data = commRes.data;
      if (data) {
        if (commentary.length === 0) {
          commentary = parseRawCommentary(data, id);
        }
        if (!match) {
          const mh = data.matchHeader || {};
          match = {
            matchId: id,
            status: 'live',
            seriesName: mh.seriesName || 'Match',
            statusText: mh.status || '',
            teams: [
              { name: 'Team 1', shortName: 'TM1' },
              { name: 'Team 2', shortName: 'TM2' },
            ],
          };
        }
      }
    } catch (backendErr) {
      console.warn('Backend commentary failed');
    }
  }

  if (match) {
    match.commentary = commentary;
  }

  return match;
}

export const openCricbuzzMatch = async (matchId: string) => {
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn('Failed to open Cricbuzz:', err);
  }
};
