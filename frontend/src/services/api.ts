import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking } from 'react-native';
import Constants from 'expo-constants';

// Backend proxy URL - protects API keys on server side
const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || 'https://scoreboard-pro-21.preview.emergentagent.com';

// Fallback: Direct RapidAPI (only used if backend is down)
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

// Primary: Use backend proxy (has caching + key rotation)
const backendClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
});

// Direct API client with key + host rotation
const getDirectClient = () => {
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  const host = RAPIDAPI_HOSTS[currentHostIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  if (currentKeyIndex % 5 === 0) {
    currentHostIndex = (currentHostIndex + 1) % RAPIDAPI_HOSTS.length;
  }
  return axios.create({
    baseURL: `https://${host}`,
    timeout: 15000,
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
  });
};

// Retry direct API with multiple keys
const directApiCall = async (endpoint: string, retries = 3): Promise<any> => {
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const client = getDirectClient();
      const res = await client.get(endpoint);
      if (res.data) return res.data;
    } catch (err: any) {
      lastError = err;
      if (err?.response?.status === 429 || err?.response?.status === 403) {
        continue; // Try next key
      }
    }
  }
  throw lastError || new Error('All API keys exhausted');
};

const transformToMatch = (m: any): Match => {
  const info = m.matchInfo || m;
  const score = m.matchScore || {};
  const state = (info.state || '').toLowerCase();
  
  let status: 'live' | 'recent' | 'upcoming' = 'upcoming';
  if (state.includes('progress') || state.includes('toss') || state.includes('innings break') || state.includes('strategic')) {
    status = 'live';
  } else if (state.includes('complete')) {
    status = 'recent';
  }

  return {
    matchId: String(info.matchId),
    seriesName: info.seriesName || 'Series',
    matchDesc: info.matchDesc || '',
    matchType: info.matchFormat || 'T20',
    status,
    statusText: info.status || info.stateTitle || '',
    venue: info.venueInfo?.ground || 'Stadium',
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

function extract(data: any): Match[] {
  const matches: Match[] = [];
  if (!data?.typeMatches) return matches;
  data.typeMatches.forEach((t: any) => {
    t.seriesMatches?.forEach((s: any) => {
      s.seriesAdWrapper?.matches?.forEach((m: any) => {
        if (m.matchInfo) matches.push(transformToMatch(m));
      });
    });
  });
  return matches;
}

// Try backend proxy first, fallback to direct API with retries
async function fetchWithFallback(
  backendEndpoint: string,
  directEndpoint: string,
  extractor: (data: any) => any
): Promise<any> {
  // Try backend proxy first (has cache + key rotation)
  try {
    const res = await backendClient.get(`/api${backendEndpoint}`);
    if (res.data) return extractor(res.data);
  } catch (backendErr) {
    console.warn('Backend proxy failed, using direct API');
  }

  // Fallback: Direct RapidAPI call with retries
  try {
    const data = await directApiCall(directEndpoint, 4);
    return extractor(data);
  } catch (directErr) {
    console.error('Direct API also failed:', directErr);
    return extractor(null);
  }
}

export async function fetchLiveMatches(): Promise<Match[]> {
  const allMatches = await fetchWithFallback(
    '/cricket/matches/live',
    '/matches/v1/live',
    (data) => extract(data || {})
  );
  // Filter: Only show truly live matches in Live tab
  return allMatches.filter((m: Match) => m.status === 'live');
}

export async function fetchRecentMatches(): Promise<Match[]> {
  const allMatches = await fetchWithFallback(
    '/cricket/matches/recent',
    '/matches/v1/recent',
    (data) => extract(data || {})
  );
  // Recent tab: show completed matches
  return allMatches.filter((m: Match) => m.status === 'recent');
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  const allMatches = await fetchWithFallback(
    '/cricket/matches/upcoming',
    '/matches/v1/upcoming',
    (data) => extract(data || {})
  );
  // Upcoming tab: show upcoming matches
  return allMatches.filter((m: Match) => m.status === 'upcoming');
}

function mapEvent(event?: string): 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' {
  if (!event) return 'normal';
  const e = event.toLowerCase();
  if (e.includes('wicket') || e.includes('out')) return 'wicket';
  if (e.includes('six')) return 'six';
  if (e.includes('four') || e.includes('boundary')) return 'four';
  if (e.includes('wide')) return 'wide';
  if (e.includes('dot') || e === 'none') return 'dot';
  return 'normal';
}

// Parse raw cricbuzz commentary response into normalized format
function parseRawCommentary(rawData: any, matchId: string): Commentary[] {
  const commentary: Commentary[] = [];
  
  // Try commentaryList (from backend normalized response)
  if (rawData?.commentaryList && Array.isArray(rawData.commentaryList)) {
    return rawData.commentaryList.map((c: any, i: number) => ({
      id: `${matchId}-${i}`,
      over: String(c.overNumber ?? c.over ?? '0.0'),
      english: c.commText || c.english || '',
      event: mapEvent(c.event),
    }));
  }

  // Parse raw cricbuzz comwrapper format
  const allComms: any[] = [];
  
  // Handle comwrapper (direct API format)
  if (rawData?.comwrapper) {
    const comwrapper = Array.isArray(rawData.comwrapper) ? rawData.comwrapper : [rawData.comwrapper];
    for (const wrapper of comwrapper) {
      const comm = wrapper?.commentary;
      if (Array.isArray(comm)) {
        allComms.push(...comm);
      } else if (comm && typeof comm === 'object') {
        allComms.push(comm);
      }
    }
  }
  
  // Handle commentaryList at root level
  if (rawData?.commentaryList && Array.isArray(rawData.commentaryList)) {
    allComms.push(...rawData.commentaryList);
  }

  // Filter and clean commentary
  for (let i = 0; i < allComms.length; i++) {
    const c = allComms[i];
    if (!c || typeof c !== 'object') continue;
    
    let text = c.commtxt || c.commText || '';
    
    // If text starts with format markers, try to extract from commentaryformats
    if (!text || text.startsWith('I0$')) {
      const formats = c.commentaryformats || [];
      for (const fmt of formats) {
        for (const val of (fmt.value || [])) {
          if (val && typeof val === 'object' && val.value) {
            text = val.value;
            break;
          }
        }
        if (text && !text.startsWith('I0$')) break;
      }
    }
    
    if (!text || text.startsWith('I0$')) continue;
    
    // Clean format markers
    text = text.replace(/[A-Z]\d+\$,?\s*/g, '').trim();
    if (!text) continue;
    
    commentary.push({
      id: `${matchId}-${i}`,
      over: String(c.overnum ?? c.overNumber ?? '0.0'),
      english: text,
      event: mapEvent((c.eventtype || c.event || 'NONE').toLowerCase()),
    });
  }
  
  return commentary;
}

export async function fetchMatchById(id: string): Promise<Match | null> {
  let match: Match | null = null;
  let commentary: Commentary[] = [];
  
  // Strategy 1: Try backend proxy for match + commentary
  try {
    const commRes = await backendClient.get(`/api/cricket/match/${id}/commentary`);
    const data = commRes.data;
    if (data) {
      commentary = parseRawCommentary(data, id);
      
      const matchHeader = data.matchHeader || {};
      const miniscore = data.miniscore || {};
      
      match = {
        matchId: id,
        status: matchHeader.state?.toLowerCase().includes('progress') ? 'live'
          : matchHeader.state?.toLowerCase().includes('complete') ? 'recent'
          : 'upcoming',
        seriesName: matchHeader.seriesName || matchHeader.seriesname || 'Match',
        statusText: matchHeader.status || '',
        teams: [
          { name: 'Team 1', shortName: 'TM1' },
          { name: 'Team 2', shortName: 'TM2' },
        ],
        commentary,
      };
      
      // Extract team scores from miniscore
      if (miniscore.inningsscores) {
        const inningsList = miniscore.inningsscores?.inningsscore || [];
        for (const inn of inningsList) {
          const shortName = inn.batteamshortname;
          const teamIdx = match.teams.findIndex(t => t.shortName === shortName);
          if (teamIdx >= 0) {
            match.teams[teamIdx].runs = inn.runs;
            match.teams[teamIdx].wickets = inn.wickets;
            match.teams[teamIdx].overs = inn.overs;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Backend commentary failed, trying match detail endpoint');
  }
  
  // Strategy 2: Try backend match detail for team info
  if (match) {
    try {
      const detailRes = await backendClient.get(`/api/cricket/match/${id}`);
      const detail = detailRes.data;
      const info = detail?.matchInfo || detail;
      if (info) {
        match.seriesName = info.seriesName || info.seriesname || match.seriesName;
        match.venue = info.venueInfo?.ground || info.venueinfo?.ground;
        match.statusText = info.status || match.statusText;
        const t1 = info.team1;
        const t2 = info.team2;
        if (t1) {
          match.teams[0].name = t1.teamName || t1.teamname || match.teams[0].name;
          match.teams[0].shortName = t1.teamSName || t1.teamsname || match.teams[0].shortName;
        }
        if (t2) {
          match.teams[1].name = t2.teamName || t2.teamname || match.teams[1].name;
          match.teams[1].shortName = t2.teamSName || t2.teamsname || match.teams[1].shortName;
        }
        const matchScore = detail?.matchScore;
        if (matchScore) {
          const t1s = matchScore.team1Score?.inngs1;
          const t2s = matchScore.team2Score?.inngs1;
          if (t1s) {
            match.teams[0].runs = t1s.runs ?? match.teams[0].runs;
            match.teams[0].wickets = t1s.wickets ?? match.teams[0].wickets;
            match.teams[0].overs = t1s.overs ?? match.teams[0].overs;
          }
          if (t2s) {
            match.teams[1].runs = t2s.runs ?? match.teams[1].runs;
            match.teams[1].wickets = t2s.wickets ?? match.teams[1].wickets;
            match.teams[1].overs = t2s.overs ?? match.teams[1].overs;
          }
        }
      }
    } catch (detailErr) {
      console.warn('Backend match detail failed');
    }
  }
  
  // If backend completely failed, try direct API
  if (!match || commentary.length === 0) {
    try {
      // Fetch match info
      const matchData = await directApiCall(`/mcenter/v1/${id}`, 3);
      if (matchData) {
        const info = matchData.matchInfo || matchData;
        if (info) {
          const transformed = transformToMatch(matchData);
          match = match || transformed;
          match.seriesName = info.seriesName || match.seriesName;
          match.venue = info.venueInfo?.ground || match.venue;
          match.statusText = info.status || match.statusText;
          if (info.team1) {
            match.teams[0].name = info.team1.teamName || match.teams[0].name;
            match.teams[0].shortName = info.team1.teamSName || match.teams[0].shortName;
          }
          if (info.team2) {
            match.teams[1].name = info.team2.teamName || match.teams[1].name;
            match.teams[1].shortName = info.team2.teamSName || match.teams[1].shortName;
          }
          // Scores from matchScore
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
      }
    } catch (err) {
      console.warn('Direct match info failed:', err);
    }
    
    // Fetch commentary via direct API
    if (commentary.length === 0) {
      try {
        const commData = await directApiCall(`/mcenter/v1/${id}/comm`, 3);
        if (commData) {
          commentary = parseRawCommentary(commData, id);
          
          // Also extract match header from comm response
          if (!match) {
            const mh = commData.matchheaders || commData.matchHeader || {};
            const ms = commData.miniscore || {};
            match = {
              matchId: id,
              status: (mh.state || '').toLowerCase().includes('progress') ? 'live' : 'recent',
              seriesName: mh.seriesName || 'Match',
              statusText: mh.status || '',
              teams: [
                { name: 'Team 1', shortName: 'TM1' },
                { name: 'Team 2', shortName: 'TM2' },
              ],
              commentary,
            };
          }
          
          // Update miniscore from comm response
          const ms = commData.miniscore || {};
          if (ms.inningsscores && match) {
            const inningsList = ms.inningsscores?.inningsscore || [];
            for (const inn of inningsList) {
              const shortName = inn.batteamshortname;
              const teamIdx = match.teams.findIndex(t => t.shortName === shortName);
              if (teamIdx >= 0) {
                match.teams[teamIdx].runs = inn.runs ?? match.teams[teamIdx].runs;
                match.teams[teamIdx].wickets = inn.wickets ?? match.teams[teamIdx].wickets;
                match.teams[teamIdx].overs = inn.overs ?? match.teams[teamIdx].overs;
              }
            }
          }
        }
      } catch (commErr) {
        console.warn('Direct commentary fetch failed:', commErr);
      }
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
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    } else {
      // Fallback: try opening directly
      await Linking.openURL(url);
    }
  } catch (err) {
    console.warn('Failed to open Cricbuzz:', err);
  }
};
