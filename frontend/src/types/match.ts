export interface Team {
  name: string;
  shortName: string;
  runs?: number;
  wickets?: number;
  overs?: string;
}

export interface Match {
  matchId: string;
  status: 'live' | 'recent' | 'upcoming';
  series: string;
  matchType: string;
  venue: string;
  teams: Team[];
  result?: string;
  startTime?: string;
}

export type MatchStatus = 'live' | 'recent' | 'upcoming';
