export interface Team {
  name: string;
  shortName: string;
  runs?: number;
  wickets?: number;
  overs?: string | number;
  flag?: string;
}

export interface Commentary {
  id?: string;
  over: string;
  ball?: number;
  english: string;
  hindi?: string;
  runs?: number;
  event?: 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal';
  timestamp?: number;
}

export interface Match {
  matchId: string;
  status: 'live' | 'recent' | 'upcoming';
  series?: string;
  seriesName?: string;
  matchType?: string;
  matchFormat?: string;
  matchDesc?: string;
  venue?: string;
  city?: string;
  teams: Team[];
  result?: string;
  statusText?: string;
  startTime?: string;
  startDate?: string;
  commentary?: Commentary[];
  category?: string;
  timestamp?: number;
  battingTeamId?: string;
}

export type MatchStatus = 'live' | 'recent' | 'upcoming';
export type Language = 'english' | 'hindi';
export type MatchCategory = 'All' | 'International' | 'League' | 'Domestic' | 'Women';
