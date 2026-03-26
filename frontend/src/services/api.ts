import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Commentary, Team } from '../types/match';
import Constants from 'expo-constants';

// ============================================
// API CONFIGURATION - BACKEND PROXY
// ============================================

// Get backend URL from multiple sources with fallback
const getBackendUrl = () => {
  // Try expo-constants extra config first (for native builds)
  if (Constants.expoConfig?.extra?.backendUrl) {
    return Constants.expoConfig.extra.backendUrl;
  }
  
  // Try process.env (for web)
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  
  // Fallback to hardcoded URL
  return 'https://pre-build-review-2.preview.emergentagent.com';
};

const BACKEND_URL = getBackendUrl();
const API_BASE = `${BACKEND_URL}/api`;

console.log('API Configuration:', { 
  BACKEND_URL, 
  API_BASE,
  hasExpoConfig: !!Constants.expoConfig?.extra?.backendUrl,
  hasProcessEnv: !!process.env.EXPO_PUBLIC_BACKEND_URL
});

// Create axios client for backend API
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// ============================================
// ASYNC STORAGE CACHE CONFIGURATION
// ============================================

const CACHE_KEYS = {
  LIVE_MATCHES: 'cricapp_live_matches',
  RECENT_MATCHES: 'cricapp_recent_matches',
  UPCOMING_MATCHES: 'cricapp_upcoming_matches',
  ALL_MATCHES: 'cricapp_all_matches',
  MATCH_DETAIL: 'cricapp_match_', // + matchId
};

const CACHE_DURATION = 50000; // 50 seconds - Smart Fetching as per requirements
const REFRESH_INTERVAL = 50000; // 50 seconds refresh interval

// ============================================
// ASYNC STORAGE CACHE HELPERS
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
    
    // Check if cache is still valid (within 50 seconds)
    if ((now - parsed.timestamp) < CACHE_DURATION) {
      console.log(`Cache HIT for ${key} (${Math.round((now - parsed.timestamp) / 1000)}s old)`);
      return parsed.data;
    }
    
    console.log(`Cache EXPIRED for ${key}`);
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
    console.log(`Cache SAVED for ${key}`);
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

// ============================================
// TYPE DEFINITIONS (API Response Structure)
// ============================================

interface CricbuzzTeam {
  teamId: number;
  teamName: string;
  teamSName: string;
  imageId?: number;
}

interface CricbuzzVenue {
  id: number;
  ground: string;
  city: string;
  timezone: string;
  latitude?: string;
  longitude?: string;
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
  state: string; // "In Progress", "Complete", "Preview"
  status: string;
  team1: CricbuzzTeam;
  team2: CricbuzzTeam;
  venueInfo: CricbuzzVenue;
  currBatTeamId?: number;
  seriesStartDt: string;
  seriesEndDt: string;
  isTimeAnnounced: boolean;
  stateTitle: string;
  isFantasyEnabled?: boolean;
}

interface CricbuzzMatch {
  matchInfo: CricbuzzMatchInfo;
  matchScore?: CricbuzzMatchScore;
}

interface CricbuzzSeriesWrapper {
  seriesId: number;
  seriesName: string;
  matches: CricbuzzMatch[];
  isLiveStreamEnabled?: boolean;
}

interface CricbuzzSeriesMatches {
  seriesAdWrapper: CricbuzzSeriesWrapper;
}

interface CricbuzzTypeMatches {
  matchType: string; // "International", "League", "Domestic", "Women"
  seriesMatches: CricbuzzSeriesMatches[];
}

interface CricbuzzMatchesResponse {
  typeMatches: CricbuzzTypeMatches[];
  filters?: {
    matchType: string[];
  };
  appIndex?: any;
  responseLastUpdated?: string;
}

interface CricbuzzCommentary {
  commtxt: string;
  timestamp: number;
  overnum: number;
  inningsid: number;
  eventtype: string;
  ballnbr: number;
}

interface CricbuzzCommentaryWrapper {
  commentary?: CricbuzzCommentary;
}

interface CricbuzzCommentaryResponse {
  inningsid: number;
  comwrapper: CricbuzzCommentaryWrapper[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const determineMatchStatus = (state: string): 'live' | 'recent' | 'upcoming' => {
  const lowerState = state.toLowerCase();
  if (lowerState.includes('progress') || lowerState.includes('innings break')) {
    return 'live';
  }
  if (lowerState.includes('complete') || lowerState.includes('won') || lowerState.includes('abandoned')) {
    return 'recent';
  }
  return 'upcoming';
};

const categorizeMatch = (matchType: string, seriesName: string, matchFormat: string): string => {
  const lowerMatchType = matchType.toLowerCase();
  const lowerSeriesName = seriesName.toLowerCase();
  
  // Women's category
  if (lowerMatchType === 'women') {
    return 'Women';
  }
  
  // League category (IPL, BBL, PSL, CPL, etc.)
  if (lowerMatchType === 'league' || 
      lowerSeriesName.includes('ipl') || 
      lowerSeriesName.includes('bbl') || 
      lowerSeriesName.includes('psl') ||
      lowerSeriesName.includes('cpl') ||
      lowerSeriesName.includes('legends league')) {
    return 'League';
  }
  
  // International category
  if (lowerMatchType === 'international' || 
      lowerSeriesName.includes('world cup') ||
      lowerSeriesName.includes('tour of') ||
      lowerSeriesName.includes('t20i') ||
      lowerSeriesName.includes('odi') ||
      lowerSeriesName.includes('test')) {
    return 'International';
  }
  
  // Domestic category (everything else)
  return 'Domestic';
};

const formatStartTime = (timestamp: string): string => {
  try {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch (e) {
    return timestamp;
  }
};

const transformCricbuzzMatch = (
  apiMatch: CricbuzzMatch,
  matchType: string
): Match => {
  const { matchInfo, matchScore } = apiMatch;
  const status = determineMatchStatus(matchInfo.state);
  const category = categorizeMatch(matchType, matchInfo.seriesName, matchInfo.matchFormat);

  // Build teams array
  const teams: Team[] = [];
  
  // Team 1
  const team1Score = matchScore?.team1Score?.inngs1;
  teams.push({
    name: matchInfo.team1.teamName,
    shortName: matchInfo.team1.teamSName,
    runs: team1Score?.runs,
    wickets: team1Score?.wickets,
    overs: team1Score?.overs?.toString(),
  });

  // Team 2
  const team2Score = matchScore?.team2Score?.inngs1;
  teams.push({
    name: matchInfo.team2.teamName,
    shortName: matchInfo.team2.teamSName,
    runs: team2Score?.runs,
    wickets: team2Score?.wickets,
    overs: team2Score?.overs?.toString(),
  });

  // Extract result from status for completed matches
  let result: string | undefined;
  if (status === 'recent' && matchInfo.status) {
    result = matchInfo.status;
  } else if (status === 'live' && matchInfo.status) {
    result = matchInfo.status;
  }

  // Extract start time for upcoming matches
  let startTime: string | undefined;
  if (status === 'upcoming' && matchInfo.startDate) {
    startTime = formatStartTime(matchInfo.startDate);
  }

  return {
    matchId: matchInfo.matchId.toString(),
    status,
    series: matchInfo.seriesName,
    matchType: matchInfo.matchFormat?.toUpperCase() || 'T20',
    venue: `${matchInfo.venueInfo.ground}, ${matchInfo.venueInfo.city}`,
    teams,
    result,
    startTime,
    category, // Add category for filtering
    timestamp: parseInt(matchInfo.startDate), // For sorting
  };
};

// ============================================
// API FUNCTIONS WITH ASYNC STORAGE CACHING
// ============================================

export const fetchLiveMatches = async (forceRefresh: boolean = false): Promise<Match[]> => {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getFromCache<Match[]>(CACHE_KEYS.LIVE_MATCHES);
      if (cached) return cached;
    }
    
    console.log('Fetching live matches from backend proxy...');
    const response = await apiClient.get<CricbuzzMatchesResponse>('/cricket/matches/live');
    
    const matches: Match[] = [];
    
    if (response.data && response.data.typeMatches) {
      response.data.typeMatches.forEach((typeMatch) => {
        typeMatch.seriesMatches.forEach((seriesMatch) => {
          // Check if matches array exists (skip ads)
          if (seriesMatch.seriesAdWrapper && seriesMatch.seriesAdWrapper.matches) {
            seriesMatch.seriesAdWrapper.matches.forEach((match) => {
              const transformedMatch = transformCricbuzzMatch(match, typeMatch.matchType);
              if (transformedMatch.status === 'live') {
                matches.push(transformedMatch);
              }
            });
          }
        });
      });
    }
    
    console.log(`Fetched ${matches.length} live matches from Cricbuzz`);
    
    // Save to cache
    await saveToCache(CACHE_KEYS.LIVE_MATCHES, matches);
    
    return matches;
  } catch (error: any) {
    console.error('Error fetching live matches:', error?.message || error);
    
    // Try to return cached data on error
    const cached = await getFromCache<Match[]>(CACHE_KEYS.LIVE_MATCHES);
    if (cached) {
      console.log('Returning stale cache on error');
      return cached;
    }
    
    return [];
  }
};

export const fetchRecentMatches = async (forceRefresh: boolean = false): Promise<Match[]> => {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getFromCache<Match[]>(CACHE_KEYS.RECENT_MATCHES);
      if (cached) return cached;
    }
    
    console.log('Fetching recent matches from backend proxy...');
    const response = await apiClient.get<CricbuzzMatchesResponse>('/cricket/matches/recent');
    
    const matches: Match[] = [];
    
    if (response.data && response.data.typeMatches) {
      response.data.typeMatches.forEach((typeMatch) => {
        typeMatch.seriesMatches.forEach((seriesMatch) => {
          // Check if matches array exists (skip ads)
          if (seriesMatch.seriesAdWrapper && seriesMatch.seriesAdWrapper.matches) {
            seriesMatch.seriesAdWrapper.matches.forEach((match) => {
              const transformedMatch = transformCricbuzzMatch(match, typeMatch.matchType);
              if (transformedMatch.status === 'recent') {
                matches.push(transformedMatch);
              }
            });
          }
        });
      });
    }
    
    console.log(`Fetched ${matches.length} recent matches from Cricbuzz`);
    
    // Save to cache
    await saveToCache(CACHE_KEYS.RECENT_MATCHES, matches);
    
    return matches;
  } catch (error: any) {
    console.error('Error fetching recent matches:', error?.message || error);
    
    // Try to return cached data on error
    const cached = await getFromCache<Match[]>(CACHE_KEYS.RECENT_MATCHES);
    if (cached) {
      console.log('Returning stale cache on error');
      return cached;
    }
    
    return [];
  }
};

export const fetchUpcomingMatches = async (forceRefresh: boolean = false): Promise<Match[]> => {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getFromCache<Match[]>(CACHE_KEYS.UPCOMING_MATCHES);
      if (cached) return cached;
    }
    
    console.log('Fetching upcoming matches from backend proxy...');
    const response = await apiClient.get<CricbuzzMatchesResponse>('/cricket/matches/upcoming');
    
    const matches: Match[] = [];
    
    if (response.data && response.data.typeMatches) {
      response.data.typeMatches.forEach((typeMatch) => {
        typeMatch.seriesMatches.forEach((seriesMatch) => {
          // Check if matches array exists (skip ads)
          if (seriesMatch.seriesAdWrapper && seriesMatch.seriesAdWrapper.matches) {
            seriesMatch.seriesAdWrapper.matches.forEach((match) => {
              const transformedMatch = transformCricbuzzMatch(match, typeMatch.matchType);
              if (transformedMatch.status === 'upcoming') {
                matches.push(transformedMatch);
              }
            });
          }
        });
      });
    }
    
    console.log(`Fetched ${matches.length} upcoming matches from Cricbuzz`);
    
    // Save to cache
    await saveToCache(CACHE_KEYS.UPCOMING_MATCHES, matches);
    
    return matches;
  } catch (error: any) {
    console.error('Error fetching upcoming matches:', error?.message || error);
    
    // Try to return cached data on error
    const cached = await getFromCache<Match[]>(CACHE_KEYS.UPCOMING_MATCHES);
    if (cached) {
      console.log('Returning stale cache on error');
      return cached;
    }
    
    return [];
  }
};

export const fetchAllMatches = async (forceRefresh: boolean = false): Promise<Match[]> => {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getFromCache<Match[]>(CACHE_KEYS.ALL_MATCHES);
      if (cached) return cached;
    }
    
    // Fetch all three categories in parallel
    const [liveMatches, upcomingMatches, recentMatches] = await Promise.all([
      fetchLiveMatches(forceRefresh),
      fetchUpcomingMatches(forceRefresh),
      fetchRecentMatches(forceRefresh),
    ]);

    // Combine all matches
    const allMatches = [...liveMatches, ...upcomingMatches, ...recentMatches];
    
    // Sort chronologically by timestamp (earliest first)
    allMatches.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeA - timeB;
    });
    
    console.log(`Total matches: ${allMatches.length} (Live: ${liveMatches.length}, Recent: ${recentMatches.length}, Upcoming: ${upcomingMatches.length})`);
    
    // Save to cache
    await saveToCache(CACHE_KEYS.ALL_MATCHES, allMatches);
    
    return allMatches;
  } catch (error) {
    console.error('Error fetching all matches:', error);
    
    // Try to return cached data on error
    const cached = await getFromCache<Match[]>(CACHE_KEYS.ALL_MATCHES);
    if (cached) return cached;
    
    throw error;
  }
};

export const fetchMatchById = async (matchId: string, forceRefresh: boolean = false): Promise<Match | null> => {
  try {
    const cacheKey = `${CACHE_KEYS.MATCH_DETAIL}${matchId}`;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getFromCache<Match>(cacheKey);
      if (cached) {
        // If live match, still fetch fresh commentary
        if (cached.status === 'live') {
          try {
            const { commentary } = await fetchMatchCommentary(matchId);
            return { ...cached, commentary };
          } catch (e) {
            return cached;
          }
        }
        return cached;
      }
    }

    // Fetch all matches and find the one we need
    const allMatches = await fetchAllMatches(forceRefresh);
    const match = allMatches.find((m: Match) => m.matchId === matchId);
    
    if (match) {
      // Fetch commentary for live and recent matches
      if (match.status === 'live' || match.status === 'recent') {
        try {
          const { commentary } = await fetchMatchCommentary(matchId);
          const matchWithCommentary = { ...match, commentary };
          await saveToCache(cacheKey, matchWithCommentary);
          return matchWithCommentary;
        } catch (e) {
          await saveToCache(cacheKey, match);
          return match;
        }
      }
      
      await saveToCache(cacheKey, match);
      return match;
    }

    return null;
  } catch (error) {
    console.error('Error fetching match by ID:', error);
    
    // Try to return cached data on error
    const cacheKey = `${CACHE_KEYS.MATCH_DETAIL}${matchId}`;
    const cached = await getFromCache<Match>(cacheKey);
    if (cached) return cached;
    
    return null;
  }
};

export const fetchMatchCommentary = async (matchId: string, page: number = 0): Promise<{ commentary: Commentary[]; hasMore: boolean }> => {
  try {
    console.log(`Fetching commentary for match ${matchId}, page ${page}...`);
    
    // Cricbuzz API supports pagination via timestamp - for simplicity, we fetch all available
    const response = await apiClient.get<CricbuzzCommentaryResponse>(`/cricket/match/${matchId}/commentary`);
    
    const commentary: Commentary[] = [];
    
    if (response.data && response.data.comwrapper) {
      response.data.comwrapper.forEach((wrapper, index) => {
        if (wrapper.commentary && wrapper.commentary.commtxt) {
          const comm = wrapper.commentary;
          
          // Determine event type
          let event: 'wicket' | 'four' | 'six' | 'dot' | 'normal' = 'normal';
          const eventType = comm.eventtype?.toLowerCase() || '';
          const commText = comm.commtxt.toLowerCase();
          
          if (eventType === 'wicket' || commText.includes('wicket') || commText.includes('out')) {
            event = 'wicket';
          } else if (eventType === 'four' || commText.includes('four') || commText.includes('b0$')) {
            event = 'four';
          } else if (eventType === 'six' || commText.includes('six')) {
            event = 'six';
          } else if (commText.includes('dot') || commText.includes('no run')) {
            event = 'dot';
          }
          
          // Extract runs from text
          let runs = 0;
          const runsMatch = commText.match(/(\d+)\s+run/);
          if (runsMatch) {
            runs = parseInt(runsMatch[1]);
          } else if (event === 'four') {
            runs = 4;
          } else if (event === 'six') {
            runs = 6;
          }
          
          // Generate Hindi translation (basic cricket terms)
          const hindiText = translateToHindi(comm.commtxt);
          
          commentary.push({
            over: comm.overnum.toString(),
            ball: comm.ballnbr % 6 || 6,
            english: comm.commtxt.replace(/B0\$/g, 'FOUR'),
            hindi: hindiText,
            runs,
            event,
          });
        }
      });
    }
    
    console.log(`Fetched ${commentary.length} total commentary items`);
    
    // For pagination, return all commentary (API already paginates)
    // hasMore indicates if there could be more items
    return {
      commentary,
      hasMore: commentary.length >= 20, // If we got 20+, there may be more
    };
  } catch (error: any) {
    console.error('Error fetching commentary:', error?.message || error);
    return { commentary: [], hasMore: false };
  }
};

// Hindi translation helper for cricket commentary
// Uses natural, conversational Hindi like Indian commentators
const translateToHindi = (englishText: string): string => {
  // For natural conversational Hindi, we translate common cricket commentary patterns
  let hindi = englishText;
  
  // Translate natural phrases first (more conversational)
  const phraseTranslations: Array<[RegExp, string]> = [
    [/no run taken/gi, 'कोई रन नहीं लिया'],
    [/goes for (?:a |the )?four/gi, 'चौका मारा'],
    [/it's (?:a |)four/gi, 'यह चौका है'],
    [/that's (?:a |)six/gi, 'वो छक्का है'],
    [/massive six/gi, 'शानदार छक्का'],
    [/huge six/gi, 'बड़ा छक्का'],
    [/what a shot/gi, 'क्या शॉट है'],
    [/great shot/gi, 'शानदार शॉट'],
    [/bowled him/gi, 'बोल्ड कर दिया'],
    [/clean bowled/gi, 'सीधे बोल्ड'],
    [/caught behind/gi, 'विकेटकीपर ने पकड़ा'],
    [/caught and bowled/gi, 'खुद ही पकड़ लिया'],
    [/great catch/gi, 'शानदार कैच'],
    [/run out/gi, 'रन आउट'],
    [/out lbw/gi, 'एलबीडब्ल्यू आउट'],
    [/beats the bat/gi, 'बल्ले से चूक गया'],
    [/through the covers/gi, 'कवर से होकर'],
    [/over mid.?wicket/gi, 'मिड विकेट के ऊपर से'],
    [/pulls it/gi, 'पुल शॉट'],
    [/drives it/gi, 'ड्राइव मारा'],
    [/flicks it/gi, 'फ्लिक किया'],
    [/cuts it/gi, 'कट शॉट'],
    [/defends/gi, 'डिफेंड किया'],
    [/leaves it/gi, 'छोड़ दिया'],
    [/dot ball/gi, 'डॉट बॉल'],
    [/no ball/gi, 'नो बॉल'],
    [/wide ball/gi, 'वाइड बॉल'],
    [/free hit/gi, 'फ्री हिट'],
    [/good length/gi, 'अच्छी लेंथ'],
    [/short ball/gi, 'छोटी गेंद'],
    [/full toss/gi, 'फुल टॉस'],
    [/yorker/gi, 'यॉर्कर'],
    [/bouncer/gi, 'बाउंसर'],
  ];
  
  phraseTranslations.forEach(([pattern, replacement]) => {
    hindi = hindi.replace(pattern, replacement);
  });
  
  // Common cricket terms (word-by-word for remaining text)
  const wordTranslations: { [key: string]: string } = {
    'four': 'चौका',
    'FOUR': 'चौका',
    'six': 'छक्का',
    'SIX': 'छक्का',
    'wicket': 'विकेट',
    'out': 'आउट',
    'bowled': 'बोल्ड',
    'caught': 'कैच',
    'lbw': 'एलबीडब्ल्यू',
    'stumped': 'स्टम्प्ड',
    'wide': 'वाइड',
    'boundary': 'बाउंड्री',
    'over': 'ओवर',
    'ball': 'गेंद',
    'batsman': 'बल्लेबाज',
    'bowler': 'गेंदबाज',
    'fielder': 'फील्डर',
    'run': 'रन',
    'runs': 'रन',
    'single': 'सिंगल',
    'double': 'दो रन',
    'triple': 'तीन रन',
    'shot': 'शॉट',
    'delivery': 'गेंद',
    'appeal': 'अपील',
    'umpire': 'अंपायर',
  };
  
  Object.entries(wordTranslations).forEach(([eng, hin]) => {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    hindi = hindi.replace(regex, hin);
  });
  
  return hindi;
};

// Backward compatible wrapper (returns just commentary array)
export const fetchMatchCommentarySimple = async (matchId: string): Promise<Commentary[]> => {
  const result = await fetchMatchCommentary(matchId);
  return result.commentary;
};

export const fetchMatchesByStatus = async (status: string, forceRefresh: boolean = false): Promise<Match[]> => {
  try {
    switch (status) {
      case 'live':
        return await fetchLiveMatches(forceRefresh);
      case 'upcoming':
        return await fetchUpcomingMatches(forceRefresh);
      case 'recent':
        return await fetchRecentMatches(forceRefresh);
      default:
        return await fetchAllMatches(forceRefresh);
    }
  } catch (error) {
    console.error('Error fetching matches by status:', error);
    throw error;
  }
};

// Live score simulation (for demo purposes when API rate limit is hit)
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

// Export cache duration for use in components
export const CACHE_CONFIG = {
  DURATION: CACHE_DURATION,
  REFRESH_INTERVAL: REFRESH_INTERVAL,
};

// Clear all match caches
export const clearMatchCache = async (): Promise<void> => {
  try {
    const keys = Object.values(CACHE_KEYS);
    await AsyncStorage.multiRemove(keys);
    console.log('Match cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};
