export interface Team {
  name: string;
  shortName: string;
  runs?: number;
  wickets?: number;
  overs?: number;
  teamId?: string | number;
  imageId?: string | number;
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
  runs?: number;       // Actual runs scored on this ball (from API structured data)
  extras?: string;     // 'wide' | 'noball' | 'legbye' | 'bye' | undefined
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
  // Pagination: timestamp for loading older commentary
  commentaryNextTimestamp?: number;
}

export type MatchCategory = 'All' | 'International' | 'League' | 'Domestic' | 'Women';
