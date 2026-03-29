export interface Team {
  name: string;
  shortName: string;
  runs?: number;
  wickets?: number;
  overs?: number;
}

export interface Commentary {
  id: string;
  over: string;
  english: string;
  event?: 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal';
}

export interface Match {
  matchId: string;
  seriesName?: string;
  matchDesc?: string;
  matchType?: string;
  matchFormat?: string;
  series?: string;
  status: 'live' | 'recent' | 'upcoming';
  statusText?: string;
  venue?: string;
  city?: string;
  startTime?: string;
  startDate?: string;
  result?: string;
  teams: Team[];
  commentary?: Commentary[];
  category?: MatchCategory;
}

export type MatchCategory = 'All' | 'International' | 'League' | 'Domestic' | 'Women';
