export interface Team {
  name: string;
  shortName: string;
  runs?: number;
  wickets?: number;
  overs?: number;
}

export interface Batsman {
  name: string;
  runs: number;
  balls: number;
  isStriker: boolean;
}

export interface Commentary {
  id: string;
  over: string;
  english: string;
  hindi?: string;
  event?: 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal';
}

export type Language = 'english' | 'hindi';

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
  // Live match data
  batsmen?: Batsman[];
  oSummary?: string; // Over summary like "1 4 W 0 2 6 | 0 1 ..."
  currentOver?: number;
}

export type MatchCategory = 'All' | 'International' | 'League' | 'Domestic' | 'Women';
