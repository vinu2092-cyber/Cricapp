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
const BACKEND_URL = 'https://scoreboard-pro-21.preview.emergentagent.com';

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

  // Poll for match updates
  const pollMatchUpdates = useCallback(async () => {
    const activeMatches = trackedMatches.filter((m) => m.enabled);
    if (activeMatches.length === 0) return;

    for (const tracked of activeMatches) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/cricket/match/${tracked.matchId}/events?lastScore=${encodeURIComponent(tracked.lastScore || '')}&lastWickets=${tracked.lastWickets || 0}&lastOvers=${encodeURIComponent(tracked.lastOvers || '')}`);
        if (!res.ok) continue;
        const data = await res.json();

        if (data.events && data.events.length > 0) {
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
        if (data.currentScore) {
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
