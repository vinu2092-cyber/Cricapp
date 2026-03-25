import axios from 'axios';
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
  return 'https://master-command.preview.emergentagent.com';
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
// API FUNCTIONS
// ============================================

export const fetchLiveMatches = async (): Promise<Match[]> => {
  try {
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
    return matches;
  } catch (error: any) {
    console.error('Error fetching live matches:', error?.message || error);
    return [];
  }
};

export const fetchRecentMatches = async (): Promise<Match[]> => {
  try {
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
    return matches;
  } catch (error: any) {
    console.error('Error fetching recent matches:', error?.message || error);
    return [];
  }
};

export const fetchUpcomingMatches = async (): Promise<Match[]> => {
  try {
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
    return matches;
  } catch (error: any) {
    console.error('Error fetching upcoming matches:', error?.message || error);
    return [];
  }
};

export const fetchAllMatches = async (): Promise<Match[]> => {
  try {
    // Fetch all three categories in parallel
    const [liveMatches, upcomingMatches, recentMatches] = await Promise.all([
      fetchLiveMatches(),
      fetchUpcomingMatches(),
      fetchRecentMatches(),
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
    
    return allMatches;
  } catch (error) {
    console.error('Error fetching all matches:', error);
    throw error;
  }
};

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
        
        // If live match, fetch fresh commentary
        if (cachedMatch.status === 'live') {
          try {
            const commentary = await fetchMatchCommentary(matchId);
            return { ...cachedMatch, commentary };
          } catch (e) {
            return cachedMatch;
          }
        }
        
        return cachedMatch;
      }
    }

    // Fetch all matches and update cache
    const allMatches = await fetchAllMatches();
    matchCache = allMatches;
    cacheTimestamp = now;
    
    const match = allMatches.find((m: Match) => m.matchId === matchId);
    if (match) {
      // Fetch commentary for live and recent matches
      if (match.status === 'live' || match.status === 'recent') {
        try {
          const commentary = await fetchMatchCommentary(matchId);
          return { ...match, commentary };
        } catch (e) {
          return match;
        }
      }
      return match;
    }

    return null;
  } catch (error) {
    console.error('Error fetching match by ID:', error);
    return null;
  }
};

export const fetchMatchCommentary = async (matchId: string): Promise<Commentary[]> => {
  try {
    console.log(`Fetching commentary for match ${matchId}...`);
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
          
          commentary.push({
            over: comm.overnum.toString(),
            ball: comm.ballnbr % 6 || 6,
            english: comm.commtxt.replace(/B0\$/g, 'FOUR'),
            hindi: '', // API doesn't provide Hindi commentary
            runs,
            event,
          });
        }
      });
    }
    
    console.log(`Fetched ${commentary.length} commentary items`);
    return commentary.slice(0, 20); // Return top 20 commentary items
  } catch (error: any) {
    console.error('Error fetching commentary:', error?.message || error);
    return [];
  }
};

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
