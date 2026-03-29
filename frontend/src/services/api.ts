import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Commentary, Team } from '../types/match';
import Constants from 'expo-constants';

// ============================================
// DIRECT RAPIDAPI CONFIGURATION (Production APK)
// ============================================

// RapidAPI Keys with rotation
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

const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
const RAPIDAPI_BASE = "https://cricbuzz-cricket.p.rapidapi.com";

let currentKeyIndex = 0;

const getNextKey = () => {
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  return key;
};

const rotateKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  console.log(`[API] Rotated to key index: ${currentKeyIndex}`);
};

// Create axios client for direct RapidAPI access
const createApiClient = () => {
  return axios.create({
    baseURL: RAPIDAPI_BASE,
    timeout: 15000,
    headers: {
      'X-RapidAPI-Key': getNextKey(),
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
};

// ============================================
// ASYNC STORAGE CACHE CONFIGURATION
// ============================================

const CACHE_KEYS = {
  LIVE_MATCHES: 'cricapp_live_matches',
  RECENT_MATCHES: 'cricapp_recent_matches',
  UPCOMING_MATCHES: 'cricapp_upcoming_matches',
  ALL_MATCHES: 'cricapp_all_matches',
  MATCH_DETAIL: 'cricapp_match_',
};

const CACHE_DURATION = 180000; // 3 minutes
const REFRESH_INTERVAL = 60000; // 60 seconds

// ============================================
// CACHE HELPERS
// ============================================

interface CacheData<T> {
  data: T;
  timestamp: number;
}

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) return null;
    
    const parsed: CacheData<T> = JSON.parse(cached);
    const now = Date.now();
    
    if ((now - parsed.timestamp) < CACHE_DURATION) {
      console.log(`Cache HIT for ${key}`);
      return parsed.data;
    }
    
    return null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

async function saveToCache<T>(key: string, data: T): Promise<void> {
  try {
    const cacheData: CacheData<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

// ============================================
// TYPE DEFINITIONS
// ============================================

interface CricbuzzTeam {
  teamId: number;
  teamName: string;
  teamSName: string;
  imageId?: number;
}

interface CricbuzzInnings {
  inningsId: number;
  runs: number;
  wickets: number;
  overs: number;
}

interface CricbuzzMatchScore {
  team1Score?: {
    inngs1?: CricbuzzInnings;
    inngs2?: CricbuzzInnings;
  };
  team2Score?: {
    inngs1?: CricbuzzInnings;
    inngs2?: CricbuzzInnings;
  };
}

interface CricbuzzMatchInfo {
  matchId: number;
  seriesId: number;
  seriesName: string;
  matchDesc: string;
  matchFormat: string;
  startDate: string;
  endDate?: string;
  state: string;
  status: string;
  team1: CricbuzzTeam;
  team2: CricbuzzTeam;
  venueInfo: {
    ground: string;
    city: string;
  };
  currBatTeamId?: number;
  stateTitle: string;
}

interface CricbuzzMatch {
  matchInfo: CricbuzzMatchInfo;
  matchScore?: CricbuzzMatchScore;
}

interface CricbuzzSeriesWrapper {
  seriesId: number;
  seriesName: string;
  matches: CricbuzzMatch[];
}

interface CricbuzzSeriesMatches {
  seriesAdWrapper?: CricbuzzSeriesWrapper;
}

interface CricbuzzTypeMatches {
  matchType: string;
  seriesMatches: CricbuzzSeriesMatches[];
}

interface CricbuzzMatchesResponse {
  typeMatches: CricbuzzTypeMatches[];
}

// ============================================
// TRANSFORM FUNCTIONS
// ============================================

const transformMatchState = (state: string): 'live' | 'recent' | 'upcoming' => {
  const lowerState = state.toLowerCase();
  if (lowerState.includes('progress') || lowerState.includes('live') || lowerState === 'inprogress') {
    return 'live';
  }
  if (lowerState.includes('complete') || lowerState.includes('result')) {
    return 'recent';
  }
  return 'upcoming';
};

const transformToMatch = (cricMatch: CricbuzzMatch): Match => {
  const { matchInfo, matchScore } = cricMatch;
  
  const team1Score = matchScore?.team1Score?.inngs1;
  const team2Score = matchScore?.team2Score?.inngs1;
  
  const teams: Team[] = [
    {
      name: matchInfo.team1.teamName,
      shortName: matchInfo.team1.teamSName,
      runs: team1Score?.runs,
      wickets: team1Score?.wickets,
      overs: team1Score?.overs,
      flag: `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${matchInfo.team1.imageId}/i.jpg`,
    },
    {
      name: matchInfo.team2.teamName,
      shortName: matchInfo.team2.teamSName,
      runs: team2Score?.runs,
      wickets: team2Score?.wickets,
      overs: team2Score?.overs,
      flag: `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${matchInfo.team2.imageId}/i.jpg`,
    },
  ];

  return {
    matchId: String(matchInfo.matchId),
    seriesName: matchInfo.seriesName,
    matchDesc: matchInfo.matchDesc,
    matchFormat: matchInfo.matchFormat,
    status: transformMatchState(matchInfo.state),
    statusText: matchInfo.status || matchInfo.stateTitle,
    venue: matchInfo.venueInfo?.ground || 'TBD',
    city: matchInfo.venueInfo?.city || '',
    startDate: matchInfo.startDate,
    teams,
    battingTeamId: matchInfo.currBatTeamId ? String(matchInfo.currBatTeamId) : undefined,
  };
};

// ============================================
// API FUNCTIONS WITH RETRY
// ============================================

async function makeApiRequest<T>(endpoint: string, retries = 3): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const client = axios.create({
        baseURL: RAPIDAPI_BASE,
        timeout: 15000,
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEYS[currentKeyIndex],
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      });
      
      const response = await client.get<T>(endpoint);
      return response.data;
    } catch (error: any) {
      lastError = error;
      
      if (error.response?.status === 429 || error.response?.status === 403) {
        console.log(`[API] Rate limited, rotating key...`);
        rotateKey();
      } else {
        console.error(`[API] Request failed (attempt ${attempt + 1}):`, error.message);
      }
      
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw lastError || new Error('API request failed');
}

// ============================================
// PUBLIC API FUNCTIONS
// ============================================

export async function fetchLiveMatches(): Promise<Match[]> {
  const cached = await getFromCache<Match[]>(CACHE_KEYS.LIVE_MATCHES);
  if (cached) return cached;
  
  try {
    const data = await makeApiRequest<CricbuzzMatchesResponse>('/matches/v1/live');
    const matches = extractMatches(data);
    await saveToCache(CACHE_KEYS.LIVE_MATCHES, matches);
    return matches;
  } catch (error) {
    console.error('Error fetching live matches:', error);
    throw error;
  }
}

export async function fetchRecentMatches(): Promise<Match[]> {
  const cached = await getFromCache<Match[]>(CACHE_KEYS.RECENT_MATCHES);
  if (cached) return cached;
  
  try {
    const data = await makeApiRequest<CricbuzzMatchesResponse>('/matches/v1/recent');
    const matches = extractMatches(data);
    await saveToCache(CACHE_KEYS.RECENT_MATCHES, matches);
    return matches;
  } catch (error) {
    console.error('Error fetching recent matches:', error);
    throw error;
  }
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  const cached = await getFromCache<Match[]>(CACHE_KEYS.UPCOMING_MATCHES);
  if (cached) return cached;
  
  try {
    const data = await makeApiRequest<CricbuzzMatchesResponse>('/matches/v1/upcoming');
    const matches = extractMatches(data);
    await saveToCache(CACHE_KEYS.UPCOMING_MATCHES, matches);
    return matches;
  } catch (error) {
    console.error('Error fetching upcoming matches:', error);
    throw error;
  }
}

export async function fetchAllMatches(): Promise<Match[]> {
  const cached = await getFromCache<Match[]>(CACHE_KEYS.ALL_MATCHES);
  if (cached) return cached;
  
  try {
    const [live, recent, upcoming] = await Promise.all([
      fetchLiveMatches().catch(() => []),
      fetchRecentMatches().catch(() => []),
      fetchUpcomingMatches().catch(() => []),
    ]);
    
    const allMatches = [...live, ...recent, ...upcoming];
    
    // Remove duplicates
    const uniqueMatches = allMatches.filter((match, index, self) =>
      index === self.findIndex((m) => m.matchId === match.matchId)
    );
    
    await saveToCache(CACHE_KEYS.ALL_MATCHES, uniqueMatches);
    return uniqueMatches;
  } catch (error) {
    console.error('Error fetching all matches:', error);
    throw error;
  }
}

export async function fetchMatchById(matchId: string): Promise<Match | null> {
  const cacheKey = `${CACHE_KEYS.MATCH_DETAIL}${matchId}`;
  const cached = await getFromCache<Match>(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await makeApiRequest<any>(`/mcenter/v1/${matchId}`);
    
    if (data?.matchInfo) {
      const match = transformToMatch({
        matchInfo: data.matchInfo,
        matchScore: data.scoreCard?.[0] || data.matchScore,
      });
      await saveToCache(cacheKey, match);
      return match;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching match by ID:', error);
    throw error;
  }
}

export async function fetchMatchCommentary(matchId: string): Promise<Commentary[]> {
  try {
    const data = await makeApiRequest<any>(`/mcenter/v1/${matchId}/comm`);
    
    if (data?.commentaryList) {
      return data.commentaryList
        .filter((c: any) => c.commText)
        .map((c: any, index: number) => ({
          id: `${matchId}-${index}`,
          over: c.overNumber ? `${Math.floor(c.overNumber)}.${c.ballNbr || 0}` : '0.0',
          ball: c.ballNbr || 0,
          runs: c.batRuns || 0,
          event: getEventType(c.eventType),
          english: c.commText || '',
          hindi: c.commText || '',
          timestamp: c.timestamp || Date.now(),
        }));
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching commentary:', error);
    return [];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractMatches(response: CricbuzzMatchesResponse): Match[] {
  const matches: Match[] = [];
  
  if (!response?.typeMatches) {
    return matches;
  }
  
  for (const typeMatch of response.typeMatches) {
    if (!typeMatch.seriesMatches) continue;
    
    for (const seriesMatch of typeMatch.seriesMatches) {
      const wrapper = seriesMatch.seriesAdWrapper;
      if (!wrapper?.matches) continue;
      
      for (const match of wrapper.matches) {
        if (match.matchInfo) {
          matches.push(transformToMatch(match));
        }
      }
    }
  }
  
  return matches;
}

function getEventType(eventType?: string): 'normal' | 'four' | 'six' | 'wicket' | 'dot' {
  if (!eventType) return 'normal';
  
  const type = eventType.toLowerCase();
  if (type.includes('four') || type.includes('boundary')) return 'four';
  if (type.includes('six') || type.includes('sixer')) return 'six';
  if (type.includes('wicket') || type.includes('out')) return 'wicket';
  if (type.includes('dot') || type === '0') return 'dot';
  
  return 'normal';
}

export { CACHE_DURATION, REFRESH_INTERVAL };
