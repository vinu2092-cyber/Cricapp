import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Commentary, Team } from '../types/match';
import { Linking } from 'react-native';

// ============================================
// CONFIGURATION & KEYS
// ============================================

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

// Dual Host Rotation Logic
const RAPIDAPI_HOSTS = [
  "cricbuzz-cricket.p.rapidapi.com",
  "cricbuzz.p.rapidapi.com"
];

let currentKeyIndex = 0;
let currentHostIndex = 0;

const rotateConfig = () => {
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  // Har 5 key rotation ke baad host bhi badal do compatibility ke liye
  if (currentKeyIndex % 5 === 0) {
    currentHostIndex = (currentHostIndex + 1) % RAPIDAPI_HOSTS.length;
  }
  console.log(`[API] Switched to Key Index: ${currentKeyIndex}, Host: ${RAPIDAPI_HOSTS[currentHostIndex]}`);
};

const CACHE_KEYS = {
  LIVE_MATCHES: 'cricapp_live_matches',
  RECENT_MATCHES: 'cricapp_recent_matches',
  UPCOMING_MATCHES: 'cricapp_upcoming_matches',
  ALL_MATCHES: 'cricapp_all_matches',
  MATCH_DETAIL: 'cricapp_match_',
};

const CACHE_DURATION = 180000; 
export const REFRESH_INTERVAL = 60000;

// ============================================
// EXTERNAL LINKING (Cricbuzz Permission)
// ============================================

export const openCricbuzzMatch = async (matchId: string) => {
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    console.error("Don't know how to open URI: " + url);
  }
};

// ============================================
// API CORE WITH TRANSFORMATION
// ============================================

async function makeApiRequest<T>(endpoint: string, retries = 3): Promise<T> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const host = RAPIDAPI_HOSTS[currentHostIndex];
      const client = axios.create({
        baseURL: `https://${host}`,
        timeout: 15000,
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEYS[currentKeyIndex],
          'X-RapidAPI-Host': host,
        },
      });
      
      const response = await client.get<T>(endpoint);
      return response.data;
    } catch (error: any) {
      lastError = error;
      if (error.response?.status === 429 || error.response?.status === 403) {
        rotateConfig();
      }
      if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

const transformToMatch = (cricMatch: any): Match => {
  const info = cricMatch.matchInfo || cricMatch;
  const score = cricMatch.matchScore || {};

  return {
    matchId: String(info.matchId),
    series: info.seriesName || 'Series Info N/A',
    seriesName: info.seriesName || 'Series Info N/A',
    matchDesc: info.matchDesc || '',
    matchType: info.matchFormat?.toUpperCase() || 'T20',
    status: info.state?.toLowerCase().includes('progress') ? 'live' : (info.state?.toLowerCase().includes('complete') ? 'recent' : 'upcoming'),
    statusText: info.status || info.stateTitle || 'Go to Cricbuzz for details',
    result: info.status || '',
    venue: info.venueInfo?.ground || 'TBD',
    city: info.venueInfo?.city || '',
    startDate: info.startDate,
    teams: [
      {
        name: info.team1.teamName,
        shortName: info.team1.teamSName,
        runs: score.team1Score?.inngs1?.runs,
        wickets: score.team1Score?.inngs1?.wickets,
        overs: score.team1Score?.inngs1?.overs,
        flag: `https://${RAPIDAPI_HOSTS[0]}/img/v1/i1/c${info.team1.imageId}/i.jpg`,
      },
      {
        name: info.team2.teamName,
        shortName: info.team2.teamSName,
        runs: score.team2Score?.inngs1?.runs,
        wickets: score.team2Score?.inngs1?.wickets,
        overs: score.team2Score?.inngs1?.overs,
        flag: `https://${RAPIDAPI_HOSTS[0]}/img/v1/i1/c${info.team2.imageId}/i.jpg`,
      }
    ],
    battingTeamId: info.currBatTeamId ? String(info.currBatTeamId) : undefined,
  };
};

// ============================================
// EXPORTED FUNCTIONS
// ============================================

export async function fetchLiveMatches(): Promise<Match[]> {
  try {
    const data: any = await makeApiRequest('/matches/v1/live');
    return extractMatches(data);
  } catch (error) { return []; }
}

export async function fetchMatchById(matchId: string): Promise<Match | null> {
  try {
    const [matchData, commentaryData] = await Promise.all([
      makeApiRequest<any>(`/mcenter/v1/${matchId}`),
      makeApiRequest<any>(`/mcenter/v1/${matchId}/comm`).catch(() => null),
    ]);
    
    if (!matchData?.matchInfo) return null;
    const match = transformToMatch(matchData);

    // Commentary Logic Fix
    const commList = commentaryData?.commentaryList || commentaryData?.commentaryLines || [];
    match.commentary = commList.map((c: any, index: number) => ({
      id: `${matchId}-${index}`,
      over: c.overNumber ? `${c.overNumber}` : (c.overSep ? `${c.overSep.overNum}` : '0.0'),
      ball: c.ballNbr || 0,
      runs: c.runs || 0,
      event: c.event?.toLowerCase() || 'normal',
      english: c.commText || 'Data on Cricbuzz',
      hindi: c.commText || 'Data on Cricbuzz',
      timestamp: c.timestamp || Date.now(),
    }));

    return match;
  } catch (error) { return null; }
}

function extractMatches(response: any): Match[] {
  const matches: Match[] = [];
  response?.typeMatches?.forEach((type: any) => {
    type.seriesMatches?.forEach((series: any) => {
      series.seriesAdWrapper?.matches?.forEach((m: any) => {
        matches.push(transformToMatch(m));
      });
    });
  });
  return matches;
}

// Add empty implementations for other required exports to avoid breaks
export async function fetchRecentMatches() { return []; }
export async function fetchUpcomingMatches() { return []; }
export async function fetchAllMatches() { return await fetchLiveMatches(); }

export { CACHE_DURATION };
