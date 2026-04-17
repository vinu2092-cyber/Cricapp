import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Safe lazy-load Firebase messaging — if native module isn't available, app still works
let _messaging: any = null;
try {
  _messaging = require('@react-native-firebase/messaging').default;
  console.log('[Inbox] Firebase messaging module loaded');
} catch (e) {
  console.warn('[Inbox] Firebase messaging not available, using Expo notifications only:', e);
  _messaging = null;
}

// Register background FCM handler — MUST be at module level (outside React component)
if (_messaging) {
  try {
    _messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('[FCM Background] Message received:', remoteMessage?.messageId);
      // Background messages auto-display notification tray via FCM
      // Store in AsyncStorage for inbox pickup when app opens
      const notification = remoteMessage?.notification;
      const data = remoteMessage?.data || {};
      const type = (data?.type as string) || '';

      // Only store admin/general messages in inbox (not match events)
      if (type !== 'match-reminder' && type !== 'wicket' && type !== 'four' && type !== 'six' && type !== 'milestone' && type !== 'result') {
        const newMsg = {
          id: remoteMessage?.messageId || `fcm-bg-${Date.now()}`,
          title: notification?.title || data?.title || 'CricApp',
          body: notification?.body || data?.body || '',
          timestamp: Date.now(),
          read: false,
          data,
        };
        try {
          const stored = await AsyncStorage.getItem('cricapp_inbox_messages');
          const msgs = stored ? JSON.parse(stored) : [];
          if (!msgs.some((m: any) => m.id === newMsg.id)) {
            const updated = [newMsg, ...msgs].slice(0, 100);
            await AsyncStorage.setItem('cricapp_inbox_messages', JSON.stringify(updated));
          }
        } catch {}
      }
    });
    console.log('[FCM] Background handler registered');
  } catch (bgErr) {
    console.warn('[FCM] Failed to register background handler:', bgErr);
  }
}

const INBOX_STORAGE_KEY = 'cricapp_inbox_messages';
const UNREAD_COUNT_KEY = 'cricapp_inbox_unread';
const FCM_SUBSCRIBED_KEY = 'cricapp_fcm_subscribed';
const INBOX_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours (3 days)

export interface InboxMessage {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  data?: any;
}

interface InboxContextType {
  messages: InboxMessage[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearInbox: () => void;
  cleanupExpired: () => void;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

export const InboxProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load messages from storage + cleanup expired (48h TTL)
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(INBOX_STORAGE_KEY);
        if (stored) {
          const msgs: InboxMessage[] = JSON.parse(stored);
          // Auto-delete messages older than 48 hours
          const now = Date.now();
          const fresh = msgs.filter(m => (now - m.timestamp) < INBOX_TTL_MS);
          if (fresh.length !== msgs.length) {
            console.log(`[Inbox] Cleaned ${msgs.length - fresh.length} expired messages`);
            await AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(fresh));
          }
          setMessages(fresh);
          setUnreadCount(fresh.filter(m => !m.read).length);
        }
      } catch {}
    })();
  }, []);

  // Initialize FCM on every app launch — get token + subscribe to topic
  useEffect(() => {
    initializeFCM();
  }, []);

  const initializeFCM = async () => {
    if (!_messaging) {
      console.log('[FCM] Firebase messaging not available, skipping FCM init');
      return;
    }
    try {
      // Step 1: Request notification permission
      const authStatus = await _messaging().requestPermission();
      const enabled = authStatus === 1 || authStatus === 2; // AUTHORIZED=1, PROVISIONAL=2
      if (!enabled) {
        console.log('[FCM] Notification permission denied');
        return;
      }

      // Step 2: Get FCM token via @react-native-firebase/messaging
      console.log('[FCM] Getting FCM token via native Firebase...');
      const fcmToken = await _messaging().getToken();
      console.log('[FCM] Token obtained:', fcmToken ? `${fcmToken.substring(0, 30)}...` : 'NULL');

      if (!fcmToken) {
        console.warn('[FCM] No FCM token available');
        return;
      }

      // Step 3: Store token locally
      await AsyncStorage.setItem('cricapp_fcm_token', fcmToken);

      // Step 4: Subscribe to 'all_users' topic via native Firebase SDK
      try {
        await _messaging().subscribeToTopic('all_users');
        console.log('[FCM] Subscribed to all_users topic via native SDK');
        await AsyncStorage.setItem(FCM_SUBSCRIBED_KEY, 'true');
      } catch (topicErr) {
        console.warn('[FCM] Topic subscription failed:', topicErr);
      }
    } catch (err) {
      console.warn('[FCM] initializeFCM error:', err);
    }
  };

  // Listen for incoming notifications and store in inbox
  useEffect(() => {
    let fcmUnsub: (() => void) | null = null;

    // Native Firebase foreground message listener (only if available)
    if (_messaging) {
      try {
        fcmUnsub = _messaging().onMessage(async (remoteMessage: any) => {
          console.log('[FCM] Foreground message received:', JSON.stringify(remoteMessage));
          const notification = remoteMessage.notification;
          const data = remoteMessage.data || {};
          const type = (data?.type as string) || '';

          // For match-related FCM: show local notification with deep link
          if (type === 'match-reminder' && data?.matchId) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: notification?.title || 'Match Starting Soon!',
                body: notification?.body || '',
                data: { matchId: data.matchId, type: 'match-reminder', screen: 'match-detail' },
                sound: 'default',
                ...(Platform.OS === 'android' && { channelId: 'match-reminders', priority: 'max' }),
              },
              trigger: null, // Immediate
            });
            return;
          }

          // Skip other match event types (wicket, four, six etc.) — already handled by local polling
          if (type === 'wicket' || type === 'four' || type === 'six' || type === 'milestone' || type === 'result') {
            return;
          }

          // Admin/general message: show local notification AND store in inbox
          const msgTitle = notification?.title || (data?.title as string) || 'CricApp';
          const msgBody = notification?.body || (data?.body as string) || '';

          // Show local notification immediately (foreground FCM doesn't auto-display)
          await Notifications.scheduleNotificationAsync({
            content: {
              title: msgTitle,
              body: msgBody,
              data: { ...data, screen: data?.screen || 'inbox', type: data?.type || 'admin-broadcast' },
              sound: 'default',
              ...(Platform.OS === 'android' && { channelId: 'match-alerts', priority: 'high' }),
            },
            trigger: null,
          });

          const newMsg: InboxMessage = {
            id: remoteMessage.messageId || `fcm-${Date.now()}`,
            title: msgTitle,
            body: msgBody,
            timestamp: Date.now(),
            read: false,
            data,
          };

          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            const updated = [newMsg, ...prev].slice(0, 100);
            AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
            return updated;
          });
          setUnreadCount(prev => prev + 1);
        });
      } catch (e) {
        console.warn('[FCM] Failed to set up foreground listener:', e);
      }

      // Also handle background FCM messages that open the app
      try {
        _messaging().getInitialNotification().then((remoteMessage: any) => {
          if (remoteMessage) {
            console.log('[FCM] App opened from background notification:', remoteMessage.messageId);
            const notification = remoteMessage.notification;
            const data = remoteMessage.data || {};
            const type = (data?.type as string) || '';
            if (type !== 'match-reminder' && type !== 'wicket' && type !== 'four' && type !== 'six' && type !== 'milestone' && type !== 'result') {
              const newMsg: InboxMessage = {
                id: remoteMessage.messageId || `fcm-bg-${Date.now()}`,
                title: notification?.title || 'CricApp',
                body: notification?.body || '',
                timestamp: Date.now(),
                read: true,
                data,
              };
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) return prev;
                const updated = [newMsg, ...prev].slice(0, 100);
                AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
                return updated;
              });
            }
          }
        }).catch(() => {});
      } catch (e) {
        console.warn('[FCM] Failed to get initial notification:', e);
      }
    }

    // Expo notifications foreground listener (for local notifications)
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = content.data || {};

      // Skip match-related notifications from inbox (they show as alerts)
      const type = data?.type || '';
      if (type === 'match-reminder' || type === 'wicket' || type === 'four' || type === 'six' || type === 'milestone' || type === 'result') {
        return;
      }

      // Store admin broadcasts and FCM messages in inbox
      const newMsg: InboxMessage = {
        id: notification.request.identifier || `msg-${Date.now()}`,
        title: content.title || 'CricApp',
        body: content.body || '',
        timestamp: Date.now(),
        read: false,
        data,
      };

      setMessages(prev => {
        // Dedup by id
        if (prev.some(m => m.id === newMsg.id)) return prev;
        const updated = [newMsg, ...prev].slice(0, 100);
        AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setUnreadCount(prev => prev + 1);
    });

    // Background/killed notification response listener (saves to inbox on open)
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      const data = content.data || {};
      const type = data?.type || '';

      // Save non-match notifications to inbox when tapped
      if (type !== 'match-reminder' && type !== 'wicket' && type !== 'four' && type !== 'six' && type !== 'milestone' && type !== 'result') {
        const newMsg: InboxMessage = {
          id: response.notification.request.identifier || `msg-${Date.now()}`,
          title: content.title || 'CricApp',
          body: content.body || '',
          timestamp: Date.now(),
          read: true, // Already opened
          data,
        };

        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          const updated = [newMsg, ...prev].slice(0, 100);
          AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
    });

    return () => {
      if (fcmUnsub) fcmUnsub();
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  const markAsRead = useCallback((id: string) => {
    setMessages(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, read: true } : m);
      AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      setUnreadCount(updated.filter(m => !m.read).length);
      return updated;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setMessages(prev => {
      const updated = prev.map(m => ({ ...m, read: true }));
      AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      setUnreadCount(0);
      return updated;
    });
  }, []);

  const clearInbox = useCallback(() => {
    setMessages([]);
    setUnreadCount(0);
    AsyncStorage.removeItem(INBOX_STORAGE_KEY).catch(() => {});
  }, []);

  // Cleanup messages older than 48 hours — call on inbox open
  const cleanupExpired = useCallback(() => {
    setMessages(prev => {
      const now = Date.now();
      const fresh = prev.filter(m => (now - m.timestamp) < INBOX_TTL_MS);
      if (fresh.length !== prev.length) {
        console.log(`[Inbox] Cleaned ${prev.length - fresh.length} expired messages`);
        AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(fresh)).catch(() => {});
        setUnreadCount(fresh.filter(m => !m.read).length);
      }
      return fresh;
    });
  }, []);

  return (
    <InboxContext.Provider value={{ messages, unreadCount, markAsRead, markAllAsRead, clearInbox, cleanupExpired }}>
      {children}
    </InboxContext.Provider>
  );
};

export const useInbox = (): InboxContextType => {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInbox must be inside InboxProvider');
  return ctx;
};
