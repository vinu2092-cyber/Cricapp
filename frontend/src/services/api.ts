import axios from 'axios';
import { Match, Commentary } from '../types/match';
import { Linking } from 'react-native';

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

const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
let currentKeyIndex = 0;

const getClient = () => {
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  return axios.create({
    baseURL: `https://${RAPIDAPI_HOST}`,
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST }
  });
};

export const openCricbuzzMatch = async (matchId: string) => {
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
  if (await Linking.canOpenURL(url)) await Linking.openURL(url);
};

const transformToMatch = (m: any): Match => {
  const info = m.matchInfo || m;
  const score = m.matchScore || {};
  return {
    matchId: String(info.matchId),
    seriesName: info.seriesName || 'Series',
    matchDesc: info.matchDesc || '',
    matchType: info.matchFormat || 'T20',
    status: info.state?.toLowerCase().includes('progress') ? 'live' : (info.state?.toLowerCase().includes('complete') ? 'recent' : 'upcoming'),
    statusText: info.status || info.stateTitle || '',
    venue: info.venueInfo?.ground || 'Stadium',
    teams: [
      { name: info.team1.teamName, shortName: info.team1.teamSName, runs: score.team1Score?.inngs1?.runs, wickets: score.team1Score?.inngs1?.wickets, overs: score.team1Score?.inngs1?.overs },
      { name: info.team2.teamName, shortName: info.team2.teamSName, runs: score.team2Score?.inngs1?.runs, wickets: score.team2Score?.inngs1?.wickets, overs: score.team2Score?.inngs1?.overs }
    ],
  };
};

export async function fetchLiveMatches(): Promise<Match[]> {
  try {
    const res = await getClient().get('/matches/v1/live');
    return extract(res.data);
  } catch { return []; }
}

export async function fetchRecentMatches(): Promise<Match[]> {
  try {
    const res = await getClient().get('/matches/v1/recent');
    return extract(res.data);
  } catch { return []; }
}

export async function fetchUpcomingMatches(): Promise<Match[]> {
  try {
    const res = await getClient().get('/matches/v1/upcoming');
    return extract(res.data);
  } catch { return []; }
}

export async function fetchMatchById(id: string): Promise<Match | null> {
  try {
    const res = await getClient().get(`/mcenter/v1/${id}`);
    const commRes = await getClient().get(`/mcenter/v1/${id}/comm`).catch(() => null);
    if (!res.data?.matchInfo) return null;
    const match = transformToMatch(res.data);
    const comms = commRes?.data?.commentaryList || [];
    match.commentary = comms.map((c: any, i: number) => ({
      id: `${id}-${i}`,
      over: c.overNumber || '0.0',
      english: c.commText || '',
      event: c.event?.toLowerCase() || 'normal'
    }));
    return match;
  } catch { return null; }
}

function extract(data: any): Match[] {
  const matches: Match[] = [];
  data?.typeMatches?.forEach((t: any) => t.seriesMatches?.forEach((s: any) => s.seriesAdWrapper?.matches?.forEach((m: any) => matches.push(transformToMatch(m)))));
  return matches;
}
