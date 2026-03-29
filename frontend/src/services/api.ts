import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking } from 'react-native';
import Constants from 'expo-constants';

// Backend proxy URL - protects API keys on server side
const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || 'https://scoreboard-pro-21.preview.emergentagent.com';

// Fallback: Direct RapidAPI (only used if backend is down)
const RAPIDAPI_KEYS = [
  "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",
  "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
  "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
  "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
  "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
  "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
  "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
];

const RAPIDAPI_HOSTS = [
  "cricbuzz-cricket.p.rapidapi.com",
  "cricbuzz.p.rapidapi.com",
];

let currentKeyIndex = 0;
let currentHostIndex = 0;

// Primary: Use backend proxy (has caching + key rotation)
const backendClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: 20000,
});

// Fallback: Direct API client with key rotation
const getDirectClient = () => {
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  const host = RAPIDAPI_HOSTS[currentHostIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  // Rotate host every 5 keys
  if (currentKeyIndex % 5 === 0) {
    currentHostIndex = (currentHostIndex + 1) % RAPIDAPI_HOSTS.length;
  }
  return axios.create({
    baseURL: `https://${host}`,
    timeout: 15000,
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
  });
};

const transformToMatch = (m: any): Match => {
  const info = m.matchInfo || m;
  const score = m.matchScore || {};
  return {
    matchId: String(info.matchId),
    seriesName: info.seriesName || 'Series',
    matchDesc: info.matchDesc || '',
    matchType: info.matchFormat || 'T20',
    status: info.state?.toLowerCase().includes('progress')
      ? 'live'
      : info.state?.toLowerCase().includes('complete')
        ? 'recent'
        : 'upcoming',
    statusText: info.status || info.stateTitle || '',
    venue: info.venueInfo?.ground || 'Stadium',
    teams: [
      {
        name: info.team1?.teamName || 'Team 1',
        shortName: info.team1?.teamSName || 'TM1',
        runs: score.team1Score?.inngs1?.runs,
        wickets: score.team1Score?.inngs1?.wickets,
        overs: score.team1Score?.inngs1?.overs,
      },
      {
        name: info.team2?.teamName || 'Team 2',
        shortName: info.team2?.teamSName || 'TM2',
        runs: score.team2Score?.inngs1?.runs,
        wickets: score.team2Score?.inngs1?.wickets,
        overs: score.team2Score?.inngs1?.overs,
      },
    ],
  };
};

function extract(data: any): Match[] {
  const matches: Match[] = [];
  if (!data?.typeMatches) return matches;
  data.typeMatches.forEach((t: any) => {
    t.seriesMatches?.forEach((s: any) => {
      s.seriesAdWrapper?.matches?.forEach((m: any) => {
        if (m.matchInfo) matches.push(transformToMatch(m));
      });
    });
  });
  return matches;
}

// Try backend proxy first, fallback to direct API
async function fetchWithFallback(
  backendEndpoint: string,
  directEndpoint: string,
  extractor: (data: any) => any
): Promise<any> {
  // Try backend proxy first (has cache + key rotation)
  try {
    const res = await backendClient.get(`/api${backendEndpoint}`);
    return extractor(res.data);
  } catch (backendErr) {
    console.warn('Backend proxy failed, using direct API:', backendErr);
  }

  // Fallback: Direct RapidAPI call
  try {
    const res = await getDirectClient().get(directEndpoint);
    return extractor(res.data);
  } catch (directErr) {
    console.error('Direct API also failed:', directErr);
    return extractor(null);
  }
}

export async function fetchLiveMatches(): Promise<Match[]> {
  return fetchWithFallback('/cricket/matches/live', '/matches/v1/live', (data) => extract(data || {}));
}

export async function fetchRecentMatches(): Promise<Match[]> {
  return fetchWithFallback('/cricket/matches/recent', '/matches/v1/recent', (data) => extract(data || {}));
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  return fetchWithFallback('/cricket/matches/upcoming', '/matches/v1/upcoming', (data) => extract(data || {}));
}

export async function fetchMatchById(id: string): Promise<Match | null> {
  // Try backend proxy for match info
  try {
    const res = await backendClient.get(`/api/cricket/match/${id}/commentary`);
    const data = res.data;
    if (!data) return null;

    // Use normalized commentaryList from backend
    const comms = data.commentaryList || [];
    const matchHeader = data.matchHeader || {};
    const miniscore = data.miniscore || {};

    // Build match object
    const match: Match = {
      matchId: id,
      status: matchHeader.state?.toLowerCase().includes('progress') ? 'live'
        : matchHeader.state?.toLowerCase().includes('complete') ? 'recent'
        : 'upcoming',
      seriesName: matchHeader.seriesName || matchHeader.seriesname || 'Match',
      statusText: matchHeader.status || '',
      teams: [
        { name: 'Team 1', shortName: 'TM1' },
        { name: 'Team 2', shortName: 'TM2' },
      ],
      commentary: comms.map((c: any, i: number) => ({
        id: `${id}-${i}`,
        over: String(c.overNumber ?? '0.0'),
        english: c.commText || '',
        event: mapEvent(c.event),
      })),
    };

    // Try to get team info from miniscore
    if (miniscore.inningsscores) {
      const inningsList = miniscore.inningsscores?.inningsscore || [];
      if (inningsList.length > 0) {
        const currentInnings = inningsList[inningsList.length - 1];
        const batTeamShort = currentInnings.batteamshortname;
        const idx = match.teams.findIndex((t) => t.shortName === batTeamShort);
        if (idx >= 0) {
          match.teams[idx].runs = currentInnings.runs;
          match.teams[idx].wickets = currentInnings.wickets;
          match.teams[idx].overs = currentInnings.overs;
        }
        // Get previous innings score
        if (inningsList.length > 1) {
          const prevInnings = inningsList[0];
          const prevIdx = match.teams.findIndex((t) => t.shortName === prevInnings.batteamshortname);
          if (prevIdx >= 0) {
            match.teams[prevIdx].runs = prevInnings.runs;
            match.teams[prevIdx].wickets = prevInnings.wickets;
            match.teams[prevIdx].overs = prevInnings.overs;
          }
        }
      }
    }

    // Also try match detail endpoint for full team info
    try {
      const detailRes = await backendClient.get(`/api/cricket/match/${id}`);
      const detail = detailRes.data;
      // Handle both camelCase and lowercase API responses
      const info = detail?.matchInfo || detail;
      if (info) {
        match.seriesName = info.seriesName || info.seriesname || match.seriesName;
        match.venue = info.venueInfo?.ground || info.venueinfo?.ground;
        match.statusText = info.status || match.statusText;
        match.status = (info.state || '').toLowerCase().includes('progress') ? 'live'
          : (info.state || '').toLowerCase().includes('complete') ? 'recent'
          : match.status;
        const t1 = info.team1;
        const t2 = info.team2;
        if (t1) {
          match.teams[0] = {
            name: t1.teamName || t1.teamname || match.teams[0].name,
            shortName: t1.teamSName || t1.teamsname || match.teams[0].shortName,
            runs: match.teams[0].runs,
            wickets: match.teams[0].wickets,
            overs: match.teams[0].overs,
          };
        }
        if (t2) {
          match.teams[1] = {
            name: t2.teamName || t2.teamname || match.teams[1].name,
            shortName: t2.teamSName || t2.teamsname || match.teams[1].shortName,
            runs: match.teams[1].runs,
            wickets: match.teams[1].wickets,
            overs: match.teams[1].overs,
          };
        }
        // Get scores from matchScore (camelCase API)
        const matchScore = detail?.matchScore;
        if (matchScore) {
          const t1s = matchScore.team1Score?.inngs1;
          const t2s = matchScore.team2Score?.inngs1;
          if (t1s) {
            match.teams[0].runs = t1s.runs;
            match.teams[0].wickets = t1s.wickets;
            match.teams[0].overs = t1s.overs;
          }
          if (t2s) {
            match.teams[1].runs = t2s.runs;
            match.teams[1].wickets = t2s.wickets;
            match.teams[1].overs = t2s.overs;
          }
        }
      }
    } catch (detailErr) {
      // Detail fetch is optional, commentary still works
      console.warn('Match detail fetch failed:', detailErr);
    }

    return match;
  } catch (err) {
    console.warn('Backend proxy failed for match detail:', err);
  }

  // Fallback: Direct API
  try {
    const client = getDirectClient();
    const res = await client.get(`/mcenter/v1/${id}`);
    const commRes = await getDirectClient().get(`/mcenter/v1/${id}/comm`).catch(() => null);
    if (!res.data?.matchInfo) return null;
    const match = transformToMatch(res.data);
    if (commRes?.data?.comwrapper) {
      const allComms: any[] = [];
      for (const wrapper of commRes.data.comwrapper) {
        const comm = wrapper.commentary;
        if (Array.isArray(comm)) allComms.push(...comm);
        else if (comm && typeof comm === 'object') allComms.push(comm);
      }
      match.commentary = allComms
        .filter((c: any) => c.commtxt && !c.commtxt.startsWith('I0$'))
        .map((c: any, i: number) => ({
          id: `${id}-${i}`,
          over: String(c.overnum ?? '0.0'),
          english: c.commtxt || '',
          event: mapEvent(c.eventtype?.toLowerCase()),
        }));
    }
    return match;
  } catch (e) {
    console.error('Direct API also failed for match detail:', e);
    return null;
  }
}

function mapEvent(event?: string): 'wicket' | 'four' | 'six' | 'dot' | 'normal' {
  if (!event) return 'normal';
  const e = event.toLowerCase();
  if (e.includes('wicket') || e.includes('out')) return 'wicket';
  if (e.includes('six')) return 'six';
  if (e.includes('four') || e.includes('boundary')) return 'four';
  if (e.includes('dot') || e === 'none') return 'dot';
  return 'normal';
}

export const openCricbuzzMatch = async (matchId: string) => {
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  } catch (err) {
    console.warn('Failed to open Cricbuzz:', err);
  }
};
