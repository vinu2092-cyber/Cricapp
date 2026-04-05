import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setupNotificationChannel,
  requestNotificationPermission,
  sendMatchAlert,
  cancelAllMatchAlerts,
  scheduleMatchReminder,
  AlertType,
} from '../services/NotificationService';

const TRACKED_MATCHES_KEY = 'cricapp_tracked_matches';
const AUTO_TRACK_ENABLED_KEY = 'cricapp_auto_track_enabled';
const SCHEDULED_REMINDERS_KEY = 'cricapp_scheduled_reminders';
const POLL_INTERVAL_ACTIVE = 30000;    // 30s when app is active for real-time alerts
const POLL_INTERVAL_BACKGROUND = 60000; // 60s when app is in background
const AUTO_TRACK_CHECK_INTERVAL = 300000; // Check for new IPL/International matches every 5 min

// Direct RapidAPI keys - ALL KEYS (limits refresh periodically)
const RAPIDAPI_KEYS = [
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",
  "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",
  "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
  "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
  "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
  "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
  "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
  "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
  "39135304c0msh9b36fa9057dbf23p141f77jsnfb140a4c7127",
  "3151754456msh3821b80e3429ed0p15ac70jsn887be255a4d6",
  "6a948b174dmsh4e7c9f6c75d3531p10b8e4jsna91b6b6ba925",
  "1a6681fd59mshb9cbb21cf3aa0f3p127c5djsnc12085b39c27",
  "be681ef5f4mshf8eb5972bbbe7abp1d55d8jsn54464cbad4d4",
  "efa0ba9303mshae4ea9f45a69057p1fde83jsn4ec1c45ca5e5",
  "49895f57cbmshcecd98ee667ebbep185640jsn45fede2e9915",
  "3b5c50ff5fmsh88c6a221cb3a9a7p165328jsn4cba85fb1e16",
  "948dd6c539mshaa5cfb3e03965b1p1f1a63jsnbc538a0ddabf",
];
const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
let notifKeyIndex = 0;

// IPL and International series identifiers
const IPL_KEYWORDS = ['ipl', 'indian premier league', 'tata ipl'];
const INTERNATIONAL_KEYWORDS = ['test', 'odi', 'odis', 't20i', 't20is', 'world cup', 'asia cup', 'champions trophy', 'icc'];

interface TrackedMatch {
  matchId: string;
  team1Short: string;
  team2Short: string;
  seriesName?: string;
  matchStartTime?: string;
  lastScore?: string;
  lastWickets?: number;
  lastRuns?: number;
  lastOvers?: string;
  lastCommentaryId?: string;
  enabled: boolean;
  autoTracked?: boolean; // Auto-tracked IPL/International match
}

interface NotificationContextType {
  trackedMatches: TrackedMatch[];
  isTracking: (matchId: string) => boolean;
  toggleTracking: (matchId: string, team1Short: string, team2Short: string, seriesName?: string, startTime?: string) => void;
  notificationsEnabled: boolean;
  autoTrackEnabled: boolean;
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => void;
  toggleAutoTrack: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Helper: Check if series is IPL or International
const isIPLOrInternational = (seriesName: string): boolean => {
  const lower = seriesName.toLowerCase();
  return IPL_KEYWORDS.some(k => lower.includes(k)) || INTERNATIONAL_KEYWORDS.some(k => lower.includes(k));
};

// Helper: Get next API key
const getNextKey = (): string => {
  const key = RAPIDAPI_KEYS[notifKeyIndex % RAPIDAPI_KEYS.length];
  notifKeyIndex++;
  return key;
};

// Helper: Detect event type from commentary text
const detectEventFromCommentary = (commText: string): { type: AlertType | null; emoji: string } => {
  const lower = commText.toLowerCase();
  
  if (lower.includes('out') || lower.includes('wicket') || lower.includes('caught') || 
      lower.includes('bowled') || lower.includes('lbw') || lower.includes('stumped') ||
      lower.includes('run out') || lower.includes('hit wicket')) {
    return { type: 'wicket', emoji: '🔴' };
  }
  if (lower.includes('six') || lower.includes('sixer') || lower.includes('huge hit') || 
      lower.includes('over the boundary') || lower.includes('maximum')) {
    return { type: 'six', emoji: '6️⃣' };
  }
  if (lower.includes('four') || lower.includes('boundary') || lower.includes('to the fence') ||
      lower.includes('races away')) {
    return { type: 'four', emoji: '4️⃣' };
  }
  if (lower.includes('fifty') || lower.includes('50 runs') || lower.includes('half century') ||
      lower.includes('hundred') || lower.includes('century') || lower.includes('100 runs')) {
    return { type: 'milestone', emoji: '🎯' };
  }
  
  return { type: null, emoji: '' };
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trackedMatches, setTrackedMatches] = useState<TrackedMatch[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [autoTrackEnabled, setAutoTrackEnabled] = useState(true); // Auto-track ON by default
  const [scheduledReminders, setScheduledReminders] = useState<string[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTrackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load settings from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const [storedMatches, storedAutoTrack, storedReminders] = await Promise.all([
          AsyncStorage.getItem(TRACKED_MATCHES_KEY),
          AsyncStorage.getItem(AUTO_TRACK_ENABLED_KEY),
          AsyncStorage.getItem(SCHEDULED_REMINDERS_KEY),
        ]);
        
        if (storedMatches) setTrackedMatches(JSON.parse(storedMatches));
        if (storedAutoTrack !== null) setAutoTrackEnabled(JSON.parse(storedAutoTrack));
        if (storedReminders) setScheduledReminders(JSON.parse(storedReminders));
        
        await setupNotificationChannel();
        const hasPermission = await requestNotificationPermission();
        setNotificationsEnabled(hasPermission);
      } catch (err) {
        console.warn('Failed to load notification settings:', err);
      }
    })();
  }, []);

  // Save tracked matches whenever they change
  useEffect(() => {
    AsyncStorage.setItem(TRACKED_MATCHES_KEY, JSON.stringify(trackedMatches)).catch(() => {});
  }, [trackedMatches]);

  // Save auto-track setting
  useEffect(() => {
    AsyncStorage.setItem(AUTO_TRACK_ENABLED_KEY, JSON.stringify(autoTrackEnabled)).catch(() => {});
  }, [autoTrackEnabled]);

  // Save scheduled reminders
  useEffect(() => {
    AsyncStorage.setItem(SCHEDULED_REMINDERS_KEY, JSON.stringify(scheduledReminders)).catch(() => {});
  }, [scheduledReminders]);

  // Auto-track IPL and International matches
  const checkAndAutoTrackMatches = useCallback(async () => {
    if (!autoTrackEnabled || !notificationsEnabled) return;

    try {
      const key = getNextKey();
      
      // Fetch live and upcoming matches
      const [liveRes, upcomingRes] = await Promise.all([
        fetch(`https://${RAPIDAPI_HOST}/matches/v1/live`, {
          headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST },
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`https://${RAPIDAPI_HOST}/matches/v1/upcoming`, {
          headers: { 'X-RapidAPI-Key': getNextKey(), 'X-RapidAPI-Host': RAPIDAPI_HOST },
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      const processMatches = async (data: any, isLive: boolean) => {
        const typeMatches = data?.typeMatches || [];
        const newMatches: TrackedMatch[] = [];
        
        for (const typeMatch of typeMatches) {
          for (const series of typeMatch.seriesMatches || []) {
            const seriesInfo = series.seriesAdWrapper;
            if (!seriesInfo) continue;
            
            const seriesName = seriesInfo.seriesName || '';
            if (!isIPLOrInternational(seriesName)) continue;
            
            for (const match of seriesInfo.matches || []) {
              const matchInfo = match.matchInfo;
              if (!matchInfo) continue;
              
              const matchId = String(matchInfo.matchId);
              const team1Short = matchInfo.team1?.teamSName || 'TBA';
              const team2Short = matchInfo.team2?.teamSName || 'TBA';
              const startTime = matchInfo.startDate ? new Date(parseInt(matchInfo.startDate)).toISOString() : undefined;
              
              // Check if already tracking
              const alreadyTracking = trackedMatches.some(m => m.matchId === matchId);
              if (alreadyTracking) continue;
              
              newMatches.push({
                matchId,
                team1Short,
                team2Short,
                seriesName,
                matchStartTime: startTime,
                enabled: true,
                autoTracked: true,
              });
              
              // Schedule reminder for upcoming matches (10 min before)
              if (!isLive && startTime && !scheduledReminders.includes(matchId)) {
                const matchStartDate = new Date(startTime);
                await scheduleMatchReminder(matchId, team1Short, team2Short, matchStartDate, seriesName);
                setScheduledReminders(prev => [...prev, matchId]);
              }
            }
          }
        }
        
        return newMatches;
      };

      const liveData = liveRes.ok ? await liveRes.json() : null;
      const upcomingData = upcomingRes.ok ? await upcomingRes.json() : null;
      
      const liveMatches = liveData ? await processMatches(liveData, true) : [];
      const upcomingMatches = upcomingData ? await processMatches(upcomingData, false) : [];
      
      const allNewMatches = [...liveMatches, ...upcomingMatches];
      
      if (allNewMatches.length > 0) {
        setTrackedMatches(prev => [...prev, ...allNewMatches]);
        console.log(`[AutoTrack] Added ${allNewMatches.length} IPL/International matches`);
      }
    } catch (err) {
      console.warn('[AutoTrack] Failed to check for new matches:', err);
    }
  }, [autoTrackEnabled, notificationsEnabled, trackedMatches, scheduledReminders]);

  // Poll for match updates with event detection
  const pollMatchUpdates = useCallback(async () => {
    const activeMatches = trackedMatches.filter(m => m.enabled);
    if (activeMatches.length === 0) return;

    for (const tracked of activeMatches) {
      try {
        const key = getNextKey();
        
        // Fetch commentary for this match
        const commRes = await fetch(`https://${RAPIDAPI_HOST}/mcenter/v1/${tracked.matchId}/comm`, {
          headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST },
          signal: AbortSignal.timeout(10000),
        });
        
        if (!commRes.ok) continue;
        
        const commData = await commRes.json();
        const ms = commData.miniscore || {};
        const inningScores = ms.inningsscores?.inningsscore || [];
        const commentaryList = commData.commentaryList || [];
        
        // Get current batting team score
        let currentBatScore: any = null;
        for (const inn of inningScores) {
          if (inn.batteamshortname === tracked.team1Short || inn.batteamshortname === tracked.team2Short) {
            currentBatScore = inn;
            break;
          }
        }
        
        if (!currentBatScore) continue;
        
        const currentRuns = currentBatScore.runs || 0;
        const currentWickets = currentBatScore.wickets || 0;
        const currentOvers = String(currentBatScore.overs || '0');
        const battingTeam = currentBatScore.batteamshortname;
        
        // Detect events
        const events: { type: AlertType; message: string; score: string }[] = [];
        
        // Check for wicket
        if (tracked.lastWickets !== undefined && currentWickets > tracked.lastWickets) {
          events.push({
            type: 'wicket',
            message: `🔴 WICKET! ${battingTeam} loses a wicket!\nScore: ${currentRuns}/${currentWickets} (${currentOvers} ov)`,
            score: `${currentRuns}/${currentWickets}`,
          });
        }
        
        // Check commentary for Four/Six
        if (commentaryList.length > 0) {
          const latestComm = commentaryList[0];
          const commId = String(latestComm.timestamp || latestComm.commId || '');
          
          if (commId !== tracked.lastCommentaryId && latestComm.commText) {
            const { type, emoji } = detectEventFromCommentary(latestComm.commText);
            
            if (type === 'six') {
              events.push({
                type: 'six',
                message: `6️⃣ SIX! ${battingTeam} smashes it!\n${latestComm.commText.substring(0, 100)}`,
                score: `${currentRuns}/${currentWickets}`,
              });
            } else if (type === 'four') {
              events.push({
                type: 'four',
                message: `4️⃣ FOUR! ${battingTeam} finds the boundary!\n${latestComm.commText.substring(0, 100)}`,
                score: `${currentRuns}/${currentWickets}`,
              });
            } else if (type === 'milestone') {
              events.push({
                type: 'milestone',
                message: `🎯 MILESTONE! ${latestComm.commText.substring(0, 120)}`,
                score: `${currentRuns}/${currentWickets}`,
              });
            }
            
            // Update last commentary ID
            setTrackedMatches(prev =>
              prev.map(m =>
                m.matchId === tracked.matchId ? { ...m, lastCommentaryId: commId } : m
              )
            );
          }
        }
        
        // Send notifications for detected events
        for (const event of events) {
          await sendMatchAlert({
            matchId: tracked.matchId,
            type: event.type,
            title: `${tracked.team1Short} vs ${tracked.team2Short}`,
            body: event.message,
            team1Short: tracked.team1Short,
            team2Short: tracked.team2Short,
            score: event.score,
          });
        }
        
        // Update tracked state with latest score
        setTrackedMatches(prev =>
          prev.map(m =>
            m.matchId === tracked.matchId
              ? {
                  ...m,
                  lastScore: `${currentRuns}/${currentWickets}`,
                  lastWickets: currentWickets,
                  lastRuns: currentRuns,
                  lastOvers: currentOvers,
                }
              : m
          )
        );
      } catch (err) {
        // Silent fail - will retry next poll
      }
    }
  }, [trackedMatches]);

  // Manage polling based on app state
  useEffect(() => {
    const activeMatches = trackedMatches.filter(m => m.enabled);
    
    // Clear existing intervals
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    if (activeMatches.length === 0 || !notificationsEnabled) return;

    const startPolling = (interval: number) => {
      pollingRef.current = setInterval(pollMatchUpdates, interval);
      pollMatchUpdates(); // Immediate first poll
    };

    startPolling(appStateRef.current === 'active' ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_BACKGROUND);

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (nextState === 'active') {
        startPolling(POLL_INTERVAL_ACTIVE);
      } else {
        startPolling(POLL_INTERVAL_BACKGROUND);
      }
      appStateRef.current = nextState;
    });

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      subscription.remove();
    };
  }, [trackedMatches, notificationsEnabled, pollMatchUpdates]);

  // Auto-track check interval
  useEffect(() => {
    if (autoTrackRef.current) {
      clearInterval(autoTrackRef.current);
      autoTrackRef.current = null;
    }
    
    if (!autoTrackEnabled || !notificationsEnabled) return;
    
    // Initial check
    checkAndAutoTrackMatches();
    
    // Periodic check
    autoTrackRef.current = setInterval(checkAndAutoTrackMatches, AUTO_TRACK_CHECK_INTERVAL);
    
    return () => {
      if (autoTrackRef.current) clearInterval(autoTrackRef.current);
    };
  }, [autoTrackEnabled, notificationsEnabled, checkAndAutoTrackMatches]);

  const isTracking = (matchId: string): boolean =>
    trackedMatches.some(m => m.matchId === matchId && m.enabled);

  const toggleTracking = (matchId: string, team1Short: string, team2Short: string, seriesName?: string, startTime?: string) => {
    setTrackedMatches(prev => {
      const existing = prev.find(m => m.matchId === matchId);
      if (existing) {
        return prev.map(m =>
          m.matchId === matchId ? { ...m, enabled: !m.enabled } : m
        );
      }
      return [
        ...prev,
        {
          matchId,
          team1Short,
          team2Short,
          seriesName,
          matchStartTime: startTime,
          enabled: true,
          autoTracked: false,
        },
      ];
    });
  };

  const enableNotifications = async (): Promise<boolean> => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (!granted) {
      Alert.alert('Permission Required', 'Please enable notifications in device Settings to receive match alerts.');
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

  const toggleAutoTrack = () => {
    setAutoTrackEnabled(prev => !prev);
  };

  return (
    <NotificationContext.Provider
      value={{
        trackedMatches,
        isTracking,
        toggleTracking,
        notificationsEnabled,
        autoTrackEnabled,
        enableNotifications,
        disableNotifications,
        toggleAutoTrack,
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
