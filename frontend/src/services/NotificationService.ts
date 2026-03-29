import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    // Main match alerts channel
    await Notifications.setNotificationChannelAsync('match-alerts', {
      name: 'Match Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4CAF50',
      sound: 'default',
      description: 'Wicket, boundary, and milestone alerts',
    });

    // Score updates channel (lower priority)
    await Notifications.setNotificationChannelAsync('score-updates', {
      name: 'Score Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Periodic score updates for tracked matches',
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    console.warn('Notifications only work on physical devices');
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export type AlertType = 'wicket' | 'four' | 'six' | 'over-end' | 'milestone' | 'result';

interface MatchAlertPayload {
  matchId: string;
  type: AlertType;
  title: string;
  body: string;
  team1Short: string;
  team2Short: string;
  score?: string;
}

const ALERT_EMOJI: Record<AlertType, string> = {
  wicket: 'W',
  four: '4',
  six: '6',
  'over-end': '',
  milestone: '50/100',
  result: 'RESULT',
};

export async function sendMatchAlert(payload: MatchAlertPayload) {
  const tag = ALERT_EMOJI[payload.type] || '';

  // Custom vibration patterns per event type
  const vibrationPattern = VIBRATION_PATTERNS[payload.type] || [0, 250];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${tag ? `[${tag}] ` : ''}${payload.title}`,
      body: payload.body,
      data: { matchId: payload.matchId, type: payload.type },
      sound: 'default',
      vibrate: vibrationPattern,
      ...(Platform.OS === 'android' && {
        channelId: payload.type === 'result' ? 'score-updates' : 'match-alerts',
        priority: payload.type === 'wicket' || payload.type === 'six' ? 'max' : 'high',
      }),
    },
    trigger: null,
  });
}

// Custom vibration patterns: [wait, vibrate, wait, vibrate, ...]
const VIBRATION_PATTERNS: Record<AlertType, number[]> = {
  wicket: [0, 500, 200, 500, 200, 300],     // Long-pause-long-pause-short (dramatic)
  four: [0, 200, 100, 200],                  // Quick double tap
  six: [0, 300, 150, 300, 150, 300, 150, 300], // Rapid celebration pattern
  'over-end': [0, 150],                      // Single gentle buzz
  milestone: [0, 250, 100, 250, 100, 250],   // Triple pulse
  result: [0, 400, 200, 400, 200, 600],      // Grand finale pattern
};

export async function cancelAllMatchAlerts() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
