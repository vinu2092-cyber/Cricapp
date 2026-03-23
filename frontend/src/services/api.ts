import axios from 'axios';
import { Match } from '../types/match';

const API_BASE_URL = 'https://cric-app-old-archive-api-server.vercel.app';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const fetchAllMatches = async (): Promise<Match[]> => {
  try {
    const response = await apiClient.get('/api/matches');
    if (response.data.ok) {
      return response.data.data;
    }
    throw new Error('Failed to fetch matches');
  } catch (error) {
    console.error('Error fetching matches:', error);
    throw error;
  }
};

export const fetchMatchById = async (matchId: string): Promise<Match | null> => {
  try {
    const response = await apiClient.get('/api/matches');
    if (response.data.ok) {
      const match = response.data.data.find((m: Match) => m.matchId === matchId);
      return match || null;
    }
    throw new Error('Failed to fetch match');
  } catch (error) {
    console.error('Error fetching match:', error);
    throw error;
  }
};

export const fetchMatchesByStatus = async (status: string): Promise<Match[]> => {
  try {
    const response = await apiClient.get('/api/matches');
    if (response.data.ok) {
      return response.data.data.filter((m: Match) => m.status === status);
    }
    throw new Error('Failed to fetch matches');
  } catch (error) {
    console.error('Error fetching matches:', error);
    throw error;
  }
};
