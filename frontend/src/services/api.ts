import axios from 'axios';
import { Match, Commentary, Team } from '../types/match';

// ============================================
// API CONFIGURATION
// ============================================

// Vercel Archive API - for recent matches backup
const VERCEL_API_BASE = 'https://cric-app-old-archive-api-server.vercel.app';

// CricAPI - for live and upcoming real-time data
const CRICAPI_BASE = 'https://api.cricapi.com/v1';

// API Keys with rotation support
const API_KEYS = [
  'defd8cc1-ad7a-4338-81b2-bae94296c227',
  '503e33a9-2ce8-48c6-b6dc-855411f9bbda',
  '89e346a3-6ab1-4e55-a12e-fc70326fe8a9',
];

let currentKeyIndex = 0;
let keyFailureCounts: { [key: string]: number } = {};

// ============================================
// API KEY ROTATION LOGIC
// ============================================

const getNextApiKey = (): string => {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
};

const getCurrentApiKey = (): string => {
  return API_KEYS[currentKeyIndex];
};

const markKeyFailed = (key: string): void => {
  keyFailureCounts[key] = (keyFailureCounts[key] || 0) + 1;
  console.warn(`API Key ${key.substring(0, 8)}... failed. Count: ${keyFailureCounts[key]}`);
  
  // Rotate to next key
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
};

const resetKeyFailures = (): void => {
  keyFailureCounts = {};
};

// ============================================
// API CLIENTS
// ============================================

const vercelClient = axios.create({
  baseURL: VERCEL_API_BASE,
  timeout: 15000,
});

const cricApiClient = axios.create({
  baseURL: CRICAPI_BASE,
  timeout: 15000,
});

// ============================================
// COMMENTARY GENERATOR
// ============================================

const generateCommentary = (matchId: string, isLive: boolean): Commentary[] => {
  const commentaryData: Commentary[] = [
    {
      over: '19.6',
      ball: 6,
      english: 'Full delivery outside off, driven through covers for FOUR! Magnificent shot!',
      hindi: 'ऑफ के बाहर फुल डिलीवरी, कवर से होकर चौका! शानदार शॉट!',
      runs: 4,
      event: 'four',
    },
    {
      over: '19.5',
      ball: 5,
      english: 'Short ball, pulled away for a single to deep midwicket.',
      hindi: 'शॉर्ट गेंद, डीप मिडविकेट पर सिंगल के लिए पुल किया।',
      runs: 1,
      event: 'normal',
    },
    {
      over: '19.4',
      ball: 4,
      english: 'Dot ball! Good yorker, batsman digs it out.',
      hindi: 'डॉट बॉल! अच्छी यॉर्कर, बल्लेबाज ने बचाया।',
      runs: 0,
      event: 'dot',
    },
    {
      over: '19.3',
      ball: 3,
      english: 'MASSIVE SIX! Over long-on, that has gone into the stands!',
      hindi: 'बड़ा छक्का! लॉन्ग-ऑन के ऊपर, स्टैंड में गई!',
      runs: 6,
      event: 'six',
    },
    {
      over: '19.2',
      ball: 2,
      english: 'Flicked away to fine leg for two runs. Good running between the wickets.',
      hindi: 'फाइन लेग पर फ्लिक किया, दो रन। विकेटों के बीच अच्छी दौड़।',
      runs: 2,
      event: 'normal',
    },
    {
      over: '19.1',
      ball: 1,
      english: 'WICKET! Bowled him! The stumps are shattered, brilliant delivery!',
      hindi: 'विकेट! बोल्ड! स्टंप्स बिखर गए, शानदार गेंद!',
      runs: 0,
      event: 'wicket',
    },
    {
      over: '18.6',
      ball: 6,
      english: 'Defended back to the bowler. End of a tidy over.',
      hindi: 'गेंदबाज को वापस डिफेंड किया। साफ-सुथरे ओवर का अंत।',
      runs: 0,
      event: 'dot',
    },
    {
      over: '18.5',
      ball: 5,
      english: 'FOUR! Edged but safe, runs away to third man boundary.',
      hindi: 'चौका! एज लगी लेकिन सुरक्षित, थर्ड मैन बाउंड्री तक गई।',
      runs: 4,
      event: 'four',
    },
    {
      over: '18.4',
      ball: 4,
      english: 'Short and wide, cut hard for a single to point.',
      hindi: 'शॉर्ट और वाइड, पॉइंट पर सिंगल के लिए कट किया।',
      runs: 1,
      event: 'normal',
    },
    {
      over: '18.3',
      ball: 3,
      english: 'SIX MORE! Slog sweep over deep square leg! The crowd goes wild!',
      hindi: 'और छक्का! डीप स्क्वायर लेग पर स्लॉग स्वीप! भीड़ उत्साहित!',
      runs: 6,
      event: 'six',
    },
  ];

  return commentaryData;
};

// ============================================
// DATA TRANSFORMERS
// ============================================

interface CricAPIMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: {
    name: string;
    shortname: string;
    img?: string;
  }[];
  score?: {
    r: number;
    w: number;
    o: number;
    inning: string;
  }[];
  matchStarted: boolean;
  matchEnded: boolean;
}

const determineMatchStatus = (apiMatch: CricAPIMatch): 'live' | 'recent' | 'upcoming' => {
  if (!apiMatch.matchStarted && !apiMatch.matchEnded) {
    return 'upcoming';
  }
  if (apiMatch.matchStarted && !apiMatch.matchEnded) {
    return 'live';
  }
  return 'recent';
};

const transformCricAPIMatch = (apiMatch: CricAPIMatch): Match => {
  const status = determineMatchStatus(apiMatch);
  
  // Build teams array
  const teams: Team[] = [];
  
  if (apiMatch.teamInfo && apiMatch.teamInfo.length >= 2) {
    // Use teamInfo for better data
    apiMatch.teamInfo.forEach((teamData, index) => {
      const scoreData = apiMatch.score?.find(s => 
        s.inning.toLowerCase().includes(teamData.name.toLowerCase().split(' ')[0])
      );
      
      teams.push({
        name: teamData.name,
        shortName: teamData.shortname,
        runs: scoreData?.r,
        wickets: scoreData?.w,
        overs: scoreData?.o?.toString(),
      });
    });
  } else if (apiMatch.teams) {
    // Fallback to teams array
    apiMatch.teams.forEach((teamName, index) => {
      const scoreData = apiMatch.score?.[index];
      teams.push({
        name: teamName,
        shortName: teamName.substring(0, 3).toUpperCase(),
        runs: scoreData?.r,
        wickets: scoreData?.w,
        overs: scoreData?.o?.toString(),
      });
    });
  }

  // Extract result from status for completed matches
  let result: string | undefined;
  if (status === 'recent' && apiMatch.status) {
    result = apiMatch.status;
  }

  // Extract start time for upcoming matches
  let startTime: string | undefined;
  if (status === 'upcoming' && apiMatch.dateTimeGMT) {
    const date = new Date(apiMatch.dateTimeGMT);
    startTime = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  return {
    matchId: apiMatch.id,
    status,
    series: apiMatch.name,
    matchType: apiMatch.matchType?.toUpperCase() || 'T20',
    venue: apiMatch.venue,
    teams,
    result,
    startTime,
    // Only add commentary for live and recent matches, NOT upcoming
    commentary: status !== 'upcoming' ? generateCommentary(apiMatch.id, status === 'live') : undefined,
  };
};

// ============================================
// API FUNCTIONS WITH RETRY
// ============================================

const fetchWithRetry = async <T>(
  fetchFn: (apiKey: string) => Promise<T>,
  maxRetries: number = 3
): Promise<T> => {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    const apiKey = getCurrentApiKey();
    try {
      const result = await fetchFn(apiKey);
      
      // Check if CricAPI returned a failure status in the response body
      const response = result as any;
      if (response?.data?.status === 'failure') {
        console.warn(`CricAPI returned failure for key ${apiKey.substring(0, 8)}...: ${response.data.reason || 'Unknown reason'}`);
        markKeyFailed(apiKey);
        continue; // Try next key
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed with key ${apiKey.substring(0, 8)}...`, error.message);
      
      // Check if it's a rate limit or auth error
      if (error.response?.status === 429 || error.response?.status === 401) {
        markKeyFailed(apiKey);
      } else {
        // For other errors, still try next key
        markKeyFailed(apiKey);
      }
    }
  }
  
  throw lastError || new Error('All API keys exhausted');
};

// ============================================
// FETCH LIVE MATCHES FROM CRICAPI
// ============================================

export const fetchLiveMatches = async (): Promise<Match[]> => {
  try {
    const response = await fetchWithRetry(async (apiKey) => {
      return await cricApiClient.get(`/currentMatches?apikey=${apiKey}&offset=0`);
    });

    if (response.data && response.data.data) {
      const matches = response.data.data
        .map((m: CricAPIMatch) => transformCricAPIMatch(m))
        .filter((m: Match) => m.status === 'live');
      
      console.log(`Fetched ${matches.length} live matches from CricAPI`);
      return matches;
    }
    return [];
  } catch (error) {
    console.error('Error fetching live matches:', error);
    return [];
  }
};

// ============================================
// FETCH UPCOMING MATCHES FROM CRICAPI
// ============================================

export const fetchUpcomingMatches = async (): Promise<Match[]> => {
  try {
    console.log('Fetching upcoming matches from CricAPI...');
    const response = await fetchWithRetry(async (apiKey) => {
      console.log(`Trying CricAPI with key ${apiKey.substring(0, 8)}...`);
      return await cricApiClient.get(`/matches?apikey=${apiKey}&offset=0`);
    });

    console.log('CricAPI response received:', response?.data?.status);
    
    if (response.data && response.data.data) {
      const allMatches = response.data.data.map((m: CricAPIMatch) => transformCricAPIMatch(m));
      const upcomingMatches = allMatches.filter((m: Match) => m.status === 'upcoming');
      
      console.log(`Fetched ${upcomingMatches.length} upcoming matches from CricAPI (out of ${allMatches.length} total)`);
      return upcomingMatches;
    }
    console.log('No data in CricAPI response');
    return [];
  } catch (error: any) {
    console.error('Error fetching upcoming matches:', error?.message || error);
    console.error('Full error:', JSON.stringify(error, null, 2));
    return [];
  }
};

// ============================================
// FETCH RECENT MATCHES FROM VERCEL ARCHIVE
// ============================================

export const fetchRecentMatches = async (): Promise<Match[]> => {
  try {
    const response = await vercelClient.get('/api/matches');
    
    if (response.data.ok) {
      const matches = response.data.data.map((m: Match) => ({
        ...m,
        commentary: generateCommentary(m.matchId, false),
      }));
      
      console.log(`Fetched ${matches.length} recent matches from Vercel`);
      return matches;
    }
    return [];
  } catch (error) {
    console.error('Error fetching recent matches from Vercel:', error);
    
    // Fallback: try to get recent matches from CricAPI
    try {
      const response = await fetchWithRetry(async (apiKey) => {
        return await cricApiClient.get(`/currentMatches?apikey=${apiKey}&offset=0`);
      });

      if (response.data && response.data.data) {
        const matches = response.data.data
          .map((m: CricAPIMatch) => transformCricAPIMatch(m))
          .filter((m: Match) => m.status === 'recent');
        
        console.log(`Fetched ${matches.length} recent matches from CricAPI (fallback)`);
        return matches;
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
    }
    
    return [];
  }
};

// ============================================
// FETCH ALL MATCHES
// ============================================

export const fetchAllMatches = async (): Promise<Match[]> => {
  try {
    // Fetch all three categories in parallel
    const [liveMatches, upcomingMatches, recentMatches] = await Promise.all([
      fetchLiveMatches(),
      fetchUpcomingMatches(),
      fetchRecentMatches(),
    ]);

    // Combine all matches
    const allMatches = [...liveMatches, ...recentMatches, ...upcomingMatches];
    
    console.log(`Total matches: ${allMatches.length} (Live: ${liveMatches.length}, Recent: ${recentMatches.length}, Upcoming: ${upcomingMatches.length})`);
    
    return allMatches;
  } catch (error) {
    console.error('Error fetching all matches:', error);
    throw error;
  }
};

// ============================================
// FETCH SINGLE MATCH BY ID
// ============================================

// Simple in-memory cache for matches
let matchCache: Match[] = [];
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60000; // 1 minute cache

export const fetchMatchById = async (matchId: string): Promise<Match | null> => {
  try {
    const now = Date.now();
    
    // Try to find in cache first if cache is still valid
    if (matchCache.length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
      const cachedMatch = matchCache.find((m: Match) => m.matchId === matchId);
      if (cachedMatch) {
        console.log('Returning match from cache');
        return cachedMatch;
      }
    }

    // Try Vercel API first for recent matches
    try {
      const vercelResponse = await vercelClient.get('/api/matches');
      if (vercelResponse.data.ok) {
        const vercelMatch = vercelResponse.data.data.find((m: any) => m.matchId === matchId);
        if (vercelMatch) {
          const match = {
            ...vercelMatch,
            commentary: vercelMatch.status !== 'upcoming' 
              ? generateCommentary(vercelMatch.matchId, vercelMatch.status === 'live')
              : undefined,
          };
          return match;
        }
      }
    } catch (vercelError) {
      console.log('Vercel API failed, trying CricAPI...');
    }

    // Try CricAPI for upcoming/live matches
    try {
      const response = await fetchWithRetry(async (apiKey) => {
        return await cricApiClient.get(`/matches?apikey=${apiKey}&offset=0`);
      });

      if (response.data && response.data.data) {
        const apiMatch = response.data.data.find((m: CricAPIMatch) => m.id === matchId);
        if (apiMatch) {
          return transformCricAPIMatch(apiMatch);
        }
      }
    } catch (cricApiError) {
      console.error('CricAPI failed:', cricApiError);
    }

    // Last resort: fetch all and cache
    try {
      const allMatches = await fetchAllMatches();
      matchCache = allMatches;
      cacheTimestamp = now;
      
      const match = allMatches.find((m: Match) => m.matchId === matchId);
      if (match) {
        return match;
      }
    } catch (allError) {
      console.error('Fetch all failed:', allError);
    }

    return null;
  } catch (error) {
    console.error('Error fetching match by ID:', error);
    return null;
  }
};

// ============================================
// FETCH MATCHES BY STATUS
// ============================================

export const fetchMatchesByStatus = async (status: string): Promise<Match[]> => {
  try {
    switch (status) {
      case 'live':
        return await fetchLiveMatches();
      case 'upcoming':
        return await fetchUpcomingMatches();
      case 'recent':
        return await fetchRecentMatches();
      default:
        return await fetchAllMatches();
    }
  } catch (error) {
    console.error('Error fetching matches by status:', error);
    throw error;
  }
};

// ============================================
// LIVE SCORE SIMULATION (for demo when no live matches)
// ============================================

export const simulateLiveScoreUpdate = (match: Match): Match => {
  if (match.status !== 'live' || !match.teams[0].runs) return match;

  const team = match.teams[0];
  const randomRuns = Math.floor(Math.random() * 3);
  const isWicket = Math.random() < 0.05;

  const [oversInt, ballsStr] = (team.overs || '0.0').split('.');
  let overs = parseInt(oversInt);
  let balls = parseInt(ballsStr || '0');

  balls++;
  if (balls > 5) {
    balls = 0;
    overs++;
  }

  return {
    ...match,
    teams: [
      {
        ...team,
        runs: (team.runs || 0) + randomRuns,
        wickets: isWicket ? Math.min((team.wickets || 0) + 1, 10) : team.wickets,
        overs: `${overs}.${balls}`,
      },
      match.teams[1],
    ],
  };
};
