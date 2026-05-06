import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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

    // Match reminder channel (high priority with distinct sound)
    await Notifications.setNotificationChannelAsync('match-reminders', {
      name: 'Match Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300, 200, 300],
      lightColor: '#FFD700',
      sound: 'default',
      description: 'Upcoming match reminders (10 min before)',
      enableVibrate: true,
      showBadge: true,
    });

    // v1.0.12 — Toss alert channel. Fires the moment a tracked upcoming
    // match's toss result lands, BEFORE first ball. Uses MAX importance
    // + long vibration + default system notification ringtone so old
    // phones audibly alert the user even if they're not in the app.
    await Notifications.setNotificationChannelAsync('match-toss', {
      name: 'Match Toss Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: '#FFC107',
      sound: 'default', // system default ringtone per user confirmation
      description: 'Toss result — delivered before match start with ringtone',
      enableVibrate: true,
      showBadge: true,
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

// Schedule a notification for match start (30 minutes before)
// v1.0.16 Rev 5 (2026-05-06 user directive):
//   "Jab bhi app mein new match live section ki list mein aata h jo
//    usually 30 mins before start match aata h, tab user ko us match
//    ki details venue aur timing ka message jaana chahiye."
// Local OS-scheduled notifications fire reliably even when the app is
// killed, as long as we register them while the app is alive. We also
// include venue + start time in the body so the alert is self-contained.
export async function scheduleMatchReminder(
  matchId: string,
  team1: string,
  team2: string,
  matchStartTime: Date,
  seriesName: string,
  venue?: string,
  city?: string,
) {
  const reminderTime = new Date(matchStartTime.getTime() - 30 * 60 * 1000); // 30 min before
  const now = new Date();

  if (reminderTime <= now) {
    // Match already started or about to start, skip scheduling
    return;
  }

  const identifier = `match-reminder-${matchId}`;

  // Cancel existing reminder for this match if any
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  // Format match time for display
  const timeStr = matchStartTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = matchStartTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const venueLine = venue
    ? `📍 ${venue}${city ? ', ' + city : ''}`
    : (city ? `📍 ${city}` : '');
  const bodyLines = [
    `🏏 ${seriesName}`,
    `🕒 ${timeStr}, ${dateStr}`,
    venueLine,
    'Tap to view match details',
  ].filter(Boolean);

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `${team1} vs ${team2} — Starting in 30 min!`,
      body: bodyLines.join('\n'),
      data: { matchId, type: 'match-reminder', screen: 'match-detail' },
      sound: 'default',
      vibrate: [0, 300, 200, 300, 200, 300],
      ...(Platform.OS === 'android' && {
        channelId: 'match-reminders',
        priority: 'max',
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderTime,
    },
  });
}

// Cancel match reminder
export async function cancelMatchReminder(matchId: string) {
  await Notifications.cancelScheduledNotificationAsync(`match-reminder-${matchId}`).catch(() => {});
}

/**
 * v1.0.16 Rev 5 — Bulk pre-scheduler.
 *
 * User pain point: notifications "don't fire when app is closed". Root
 * cause: legacy auto-track ran only inside the app's React polling
 * loop, so any match that became upcoming AFTER the user backgrounded
 * the app never got a reminder scheduled. Local OS-scheduled
 * notifications (the kind we use here) fire reliably even when the app
 * is killed — provided the schedule was registered while the app was
 * alive at least once.
 *
 * This helper is therefore called every time the app loads / refreshes
 * the upcoming-match feed: it walks the list and schedules a
 * "Starting in 30 min" reminder for every match whose start is between
 * 30 minutes and 7 days from now. We use a stable identifier per
 * matchId so re-invoking this function never produces duplicate
 * notifications — `cancelScheduledNotificationAsync` inside
 * `scheduleMatchReminder` deletes any prior schedule before re-adding.
 *
 * Permission gate: OS-level. If the user denied notifications, every
 * `scheduleNotificationAsync` resolves silently — safe to call always.
 */
export async function preScheduleAllUpcomingReminders(
  matches: Array<{
    matchId: string;
    teams?: Array<{ shortName?: string; name?: string }>;
    seriesName?: string;
    venue?: string;
    city?: string;
    startTimestamp?: number;
    startDate?: string;
  }>,
): Promise<{ scheduled: number; skipped: number }> {
  let scheduled = 0;
  let skipped = 0;
  const now = Date.now();
  // Cap at 7 days out — Android's AlarmManager handles long-future
  // alarms but there's no point queuing thousands of reminders.
  const horizon = now + 7 * 24 * 60 * 60 * 1000;

  for (const m of matches) {
    try {
      const tsRaw = m.startTimestamp ?? (m.startDate ? Number(m.startDate) : undefined);
      if (!tsRaw || Number.isNaN(tsRaw)) { skipped++; continue; }
      if (tsRaw <= now || tsRaw > horizon) { skipped++; continue; }

      const team1 = m.teams?.[0]?.shortName || m.teams?.[0]?.name || 'TBA';
      const team2 = m.teams?.[1]?.shortName || m.teams?.[1]?.name || 'TBA';
      const seriesName = m.seriesName || 'Cricket Match';

      await scheduleMatchReminder(
        m.matchId,
        team1,
        team2,
        new Date(tsRaw),
        seriesName,
        m.venue,
        m.city,
      );
      scheduled++;
    } catch {
      skipped++;
    }
  }

  return { scheduled, skipped };
}

/**
 * v1.0.12 — Toss result notification.
 *
 * User brief: "Notification user k mobile par automatically toss hone k
 * baad match start hone se pehle hi, meri cricapp notification send kare
 * with ringtone aur ki is match ka toss is wali team me jeeta aur pehle
 * betting ya bowling li. User click karne par same match k page par jaaye
 * live mein."
 *
 * Fired from NotificationContext's poll loop the INSTANT a tracked
 * upcoming match's statusText starts reporting toss (e.g.
 *   "IND opt to bowl" / "AUS won the toss & elected to bat").
 * Dedup key: `toss-{matchId}` so we never send twice for same match
 * (context also persists the matchId in AsyncStorage as a belt-and-braces).
 *
 * Tapping the notification → NotificationDeepLinkHandler navigates to
 * `/match/{matchId}` which is the LIVE match detail page.
 */
export async function sendTossNotification(payload: {
  matchId: string;
  team1Short: string;
  team2Short: string;
  tossText: string; // e.g. "IND opt to bowl" or the full status line
  seriesName?: string;
}) {
  const identifier = `toss-${payload.matchId}`;
  // Clean up any previously scheduled toss for this matchId (defensive).
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const title = `🪙 Toss: ${payload.team1Short} vs ${payload.team2Short}`;
  const body = `${payload.tossText.trim()}\n${payload.seriesName ? payload.seriesName + ' · ' : ''}Match starts soon — tap to watch live!`;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      data: { matchId: payload.matchId, type: 'toss', screen: 'match-detail' },
      sound: 'default', // system ringtone
      vibrate: [0, 500, 250, 500, 250, 500],
      ...(Platform.OS === 'android' && {
        channelId: 'match-toss',
        priority: 'max',
      }),
    },
    trigger: null, // fire immediately
  });
}
