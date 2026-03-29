import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setupNotificationChannel,
  requestNotificationPermission,
  sendMatchAlert,
  cancelAllMatchAlerts,
  AlertType,
} from '../services/NotificationService';

const TRACKED_MATCHES_KEY = 'cricapp_tracked_matches';
const POLL_INTERVAL_ACTIVE = 45000;    // 45s when app is active
const POLL_INTERVAL_BACKGROUND = 90000; // 90s when app is in background

// Use same backend URL strategy as api.ts
const getBackendUrl = (): string => {
  try {
    const Constants = require('expo-constants').default;
    return Constants.expoConfig?.extra?.backendUrl || 'https://scoreboard-pro-21.preview.emergentagent.com';
  } catch {
    return 'https://scoreboard-pro-21.preview.emergentagent.com';
  }
};

// Direct RapidAPI fallback keys + hosts (same as api.ts)
const RAPIDAPI_KEYS = [
  "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",
  "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
];
const RAPIDAPI_HOSTS = [
  "cricbuzz-cricket.p.rapidapi.com",
  "cricbuzz.p.rapidapi.com",
];
let notifKeyIndex = 0;

interface TrackedMatch {
  matchId: string;
  team1Short: string;
  team2Short: string;
  lastScore?: string;
  lastWickets?: number;
  lastOvers?: string;
  lastCommentaryId?: string;
  enabled: boolean;
}

interface NotificationContextType {
  trackedMatches: TrackedMatch[];
  isTracking: (matchId: string) => boolean;
  toggleTracking: (matchId: string, team1Short: string, team2Short: string) => void;
  notificationsEnabled: boolean;
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trackedMatches, setTrackedMatches] = useState<TrackedMatch[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load tracked matches from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TRACKED_MATCHES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setTrackedMatches(parsed);
        }
        // Setup notification channels
        await setupNotificationChannel();
        const hasPermission = await requestNotificationPermission();
        setNotificationsEnabled(hasPermission);
      } catch (err) {
        console.warn('Failed to load tracked matches:', err);
      }
    })();
  }, []);

  // Save tracked matches whenever they change
  useEffect(() => {
    AsyncStorage.setItem(TRACKED_MATCHES_KEY, JSON.stringify(trackedMatches)).catch(() => {});
  }, [trackedMatches]);

  // Poll for match updates - tries backend proxy then direct API
  const pollMatchUpdates = useCallback(async () => {
    const activeMatches = trackedMatches.filter((m) => m.enabled);
    if (activeMatches.length === 0) return;

    for (const tracked of activeMatches) {
      try {
        let data: any = null;
        
        // Strategy 1: Backend proxy
        try {
          const backendUrl = getBackendUrl();
          const res = await fetch(`${backendUrl}/api/cricket/match/${tracked.matchId}/events?lastScore=${encodeURIComponent(tracked.lastScore || '')}&lastWickets=${tracked.lastWickets || 0}&lastOvers=${encodeURIComponent(tracked.lastOvers || '')}`, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            data = await res.json();
          }
        } catch (backendErr) {
          // Backend down, try direct API
        }
        
        // Strategy 2: Direct API fallback - fetch commentary and detect events
        if (!data) {
          try {
            const key = RAPIDAPI_KEYS[notifKeyIndex % RAPIDAPI_KEYS.length];
            const host = RAPIDAPI_HOSTS[notifKeyIndex % 2 === 0 ? 0 : 1];
            notifKeyIndex++;
            
            const commRes = await fetch(`https://${host}/mcenter/v1/${tracked.matchId}/comm`, {
              headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
              signal: AbortSignal.timeout(10000),
            });
            if (commRes.ok) {
              const commData = await commRes.json();
              const ms = commData.miniscore || {};
              const inningScores = ms.inningsscores?.inningsscore || [];
              
              // Detect events by comparing scores
              const events: any[] = [];
              for (const inn of inningScores) {
                const shortName = inn.batteamshortname;
                const currentScore = `${inn.runs}/${inn.wickets}`;
                
                if (shortName === tracked.team1Short || shortName === tracked.team2Short) {
                  if (tracked.lastScore && tracked.lastScore !== currentScore) {
                    // Score changed - detect what happened
                    const oldWickets = tracked.lastWickets || 0;
                    const newWickets = inn.wickets || 0;
                    
                    if (newWickets > oldWickets) {
                      events.push({ type: 'wicket', message: `${shortName}: WICKET! Score: ${currentScore}`, score: currentScore });
                    } else {
                      events.push({ type: 'four', message: `${shortName}: Score update: ${currentScore} (${inn.overs} ov)`, score: currentScore });
                    }
                  }
                }
              }
              
              // Build data in same format as backend
              const currentBatScore = inningScores[0];
              data = {
                events,
                currentScore: currentBatScore ? {
                  score: `${currentBatScore.runs}/${currentBatScore.wickets}`,
                  wickets: currentBatScore.wickets,
                  overs: String(currentBatScore.overs),
                } : null,
              };
            }
          } catch (directErr) {
            // Both failed, skip this match
            continue;
          }
        }

        if (data?.events && data.events.length > 0) {
          for (const event of data.events) {
            await sendMatchAlert({
              matchId: tracked.matchId,
              type: event.type as AlertType,
              title: `${tracked.team1Short} vs ${tracked.team2Short}`,
              body: event.message,
              team1Short: tracked.team1Short,
              team2Short: tracked.team2Short,
              score: event.score,
            });
          }
        }

        // Update tracked state with latest score
        if (data?.currentScore) {
          setTrackedMatches((prev) =>
            prev.map((m) =>
              m.matchId === tracked.matchId
                ? {
                    ...m,
                    lastScore: data.currentScore.score,
                    lastWickets: data.currentScore.wickets,
                    lastOvers: data.currentScore.overs,
                  }
                : m
            )
          );
        }
      } catch (err) {
        // Silent fail - will retry next poll
      }
    }
  }, [trackedMatches]);

  // Manage polling based on app state
  useEffect(() => {
    const activeMatches = trackedMatches.filter((m) => m.enabled);
    if (activeMatches.length === 0 || !notificationsEnabled) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const startPolling = (interval: number) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(pollMatchUpdates, interval);
      pollMatchUpdates(); // Immediate first poll
    };

    startPolling(
      appStateRef.current === 'active' ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_BACKGROUND
    );

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        startPolling(POLL_INTERVAL_ACTIVE);
      } else if (nextState !== 'active') {
        startPolling(POLL_INTERVAL_BACKGROUND);
      }
      appStateRef.current = nextState;
    });

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      subscription.remove();
    };
  }, [trackedMatches, notificationsEnabled, pollMatchUpdates]);

  const isTracking = (matchId: string): boolean =>
    trackedMatches.some((m) => m.matchId === matchId && m.enabled);

  const toggleTracking = (matchId: string, team1Short: string, team2Short: string) => {
    setTrackedMatches((prev) => {
      const existing = prev.find((m) => m.matchId === matchId);
      if (existing) {
        // Toggle enabled state
        if (existing.enabled) {
          return prev.map((m) =>
            m.matchId === matchId ? { ...m, enabled: false } : m
          );
        } else {
          return prev.map((m) =>
            m.matchId === matchId ? { ...m, enabled: true } : m
          );
        }
      }
      // Add new tracked match
      return [
        ...prev,
        {
          matchId,
          team1Short,
          team2Short,
          enabled: true,
        },
      ];
    });
  };

  const enableNotifications = async (): Promise<boolean> => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (!granted) {
      Alert.alert('Permission Required', 'Please enable notifications in device Settings.');
    }
    return granted;
  };

  const disableNotifications = () => {
    setNotificationsEnabled(false);
    cancelAllMatchAlerts();
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        trackedMatches,
        isTracking,
        toggleTracking,
        notificationsEnabled,
        enableNotifications,
        disableNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
