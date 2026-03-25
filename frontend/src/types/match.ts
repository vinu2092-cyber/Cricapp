export interface Team {
  name: string;
  shortName: string;
  runs?: number;
  wickets?: number;
  overs?: string;
}

export interface Commentary {
  over: string;
  ball: number;
  english: string;
  hindi: string;
  runs?: number;
  event?: 'wicket' | 'four' | 'six' | 'dot' | 'normal';
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
  commentary?: Commentary[];
  category?: string; // International, League, Domestic, Women
  timestamp?: number; // For sorting
}

export type MatchStatus = 'live' | 'recent' | 'upcoming';
export type Language = 'english' | 'hindi';
export type MatchCategory = 'All' | 'International' | 'League' | 'Domestic' | 'Women';
