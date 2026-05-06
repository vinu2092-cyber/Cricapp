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
  fours?: number;
  sixes?: number;
  isStriker: boolean;
}

export interface Bowler {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
}

export interface Commentary {
  id: string;
  over: string;
  english: string;
  hindi?: string;
  event?: 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal';
  runs?: number;       // Actual runs scored on this ball (from API structured data)
  extras?: string;     // 'wide' | 'noball' | 'legbye' | 'bye' | undefined
  inningsId?: number;  // Cricbuzz innings id — used to filter out mixed-innings duplicates for completed matches
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
  bowler?: Bowler;
  oSummary?: string; // Over summary like "1 4 W 0 2 6 | 0 1 ..."
  currentOver?: number;
  // v1.0.16 — short name of the team currently batting (last innings).
  // Used by the floating overlay to show only the batting team's row.
  battingTeamShortName?: string;
  // Pagination: timestamp + innings id for loading older commentary (Cricbuzz uses both)
  commentaryNextTimestamp?: number;
  commentaryNextIid?: number;
}

export type MatchCategory = 'All' | 'International' | 'League' | 'Domestic' | 'Women';
