import axios from 'axios';
import { Match, Commentary } from '../types/match';

const API_BASE_URL = 'https://cric-app-old-archive-api-server.vercel.app';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Generate mock commentary for matches
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

// Mock live matches for demonstration
const generateMockLiveMatches = (): Match[] => [
  {
    matchId: 'live-001',
    status: 'live',
    series: 'India vs England, 2nd T20I, England tour of India, 2026',
    matchType: 'T20',
    venue: 'Wankhede Stadium, Mumbai',
    teams: [
      { name: 'India', shortName: 'IND', runs: 156, wickets: 4, overs: '18.2' },
      { name: 'England', shortName: 'ENG', runs: 142, wickets: 6, overs: '17.0' },
    ],
    result: 'India needs 14 runs from 10 balls',
    commentary: generateCommentary('live-001', true),
  },
  {
    matchId: 'live-002',
    status: 'live',
    series: 'Australia vs Pakistan, 1st ODI, Pakistan tour of Australia, 2026',
    matchType: 'ODI',
    venue: 'MCG, Melbourne',
    teams: [
      { name: 'Australia', shortName: 'AUS', runs: 245, wickets: 5, overs: '42.3' },
      { name: 'Pakistan', shortName: 'PAK', runs: 0, wickets: 0, overs: '0.0' },
    ],
    result: 'Australia batting',
    commentary: generateCommentary('live-002', true),
  },
  {
    matchId: 'live-003',
    status: 'live',
    series: 'South Africa vs New Zealand, 3rd Test Day 2, NZ tour of SA, 2026',
    matchType: 'Test',
    venue: 'Newlands, Cape Town',
    teams: [
      { name: 'South Africa', shortName: 'RSA', runs: 312, wickets: 7, overs: '87.4' },
      { name: 'New Zealand', shortName: 'NZ', runs: 278, wickets: 10, overs: '82.0' },
    ],
    result: 'South Africa lead by 34 runs',
    commentary: generateCommentary('live-003', true),
  },
];

// Mock upcoming matches for demonstration
const generateMockUpcomingMatches = (): Match[] => [
  {
    matchId: 'upcoming-001',
    status: 'upcoming',
    series: 'India vs Australia, 1st T20I, Australia tour of India, 2026',
    matchType: 'T20',
    venue: 'Narendra Modi Stadium, Ahmedabad',
    teams: [
      { name: 'India', shortName: 'IND' },
      { name: 'Australia', shortName: 'AUS' },
    ],
    startTime: 'Mar 25, 07:00 PM',
  },
  {
    matchId: 'upcoming-002',
    status: 'upcoming',
    series: 'England vs West Indies, 2nd ODI, WI tour of England, 2026',
    matchType: 'ODI',
    venue: 'Lords, London',
    teams: [
      { name: 'England', shortName: 'ENG' },
      { name: 'West Indies', shortName: 'WI' },
    ],
    startTime: 'Mar 26, 02:30 PM',
  },
  {
    matchId: 'upcoming-003',
    status: 'upcoming',
    series: 'Pakistan vs Sri Lanka, 1st Test, SL tour of Pakistan, 2026',
    matchType: 'Test',
    venue: 'Gaddafi Stadium, Lahore',
    teams: [
      { name: 'Pakistan', shortName: 'PAK' },
      { name: 'Sri Lanka', shortName: 'SL' },
    ],
    startTime: 'Mar 28, 10:00 AM',
  },
  {
    matchId: 'upcoming-004',
    status: 'upcoming',
    series: 'New Zealand vs Bangladesh, 3rd T20I, BAN tour of NZ, 2026',
    matchType: 'T20',
    venue: 'Eden Park, Auckland',
    teams: [
      { name: 'New Zealand', shortName: 'NZ' },
      { name: 'Bangladesh', shortName: 'BAN' },
    ],
    startTime: 'Mar 29, 11:00 AM',
  },
];

export const fetchAllMatches = async (): Promise<Match[]> => {
  try {
    const response = await apiClient.get('/api/matches');
    if (response.data.ok) {
      const apiMatches = response.data.data.map((m: Match) => ({
        ...m,
        commentary: generateCommentary(m.matchId, false),
      }));
      
      // Combine with mock live and upcoming matches
      const liveMatches = generateMockLiveMatches();
      const upcomingMatches = generateMockUpcomingMatches();
      
      return [...liveMatches, ...apiMatches, ...upcomingMatches];
    }
    throw new Error('Failed to fetch matches');
  } catch (error) {
    console.error('Error fetching matches:', error);
    // Return mock data even if API fails
    return [
      ...generateMockLiveMatches(),
      ...generateMockUpcomingMatches(),
    ];
  }
};

export const fetchMatchById = async (matchId: string): Promise<Match | null> => {
  try {
    // Check mock live matches first
    const liveMatches = generateMockLiveMatches();
    const liveMatch = liveMatches.find((m) => m.matchId === matchId);
    if (liveMatch) return liveMatch;

    // Check mock upcoming matches
    const upcomingMatches = generateMockUpcomingMatches();
    const upcomingMatch = upcomingMatches.find((m) => m.matchId === matchId);
    if (upcomingMatch) return upcomingMatch;

    // Fetch from API
    const response = await apiClient.get('/api/matches');
    if (response.data.ok) {
      const match = response.data.data.find((m: Match) => m.matchId === matchId);
      if (match) {
        return {
          ...match,
          commentary: generateCommentary(matchId, match.status === 'live'),
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching match:', error);
    return null;
  }
};

export const fetchMatchesByStatus = async (status: string): Promise<Match[]> => {
  try {
    const allMatches = await fetchAllMatches();
    return allMatches.filter((m) => m.status === status);
  } catch (error) {
    console.error('Error fetching matches:', error);
    throw error;
  }
};

// Simulate live score updates
export const simulateLiveScoreUpdate = (match: Match): Match => {
  if (match.status !== 'live' || !match.teams[0].runs) return match;

  const team = match.teams[0];
  const randomRuns = Math.floor(Math.random() * 3); // 0, 1, or 2 runs
  const isWicket = Math.random() < 0.05; // 5% chance of wicket

  // Parse overs
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
