import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';

const INBOX_STORAGE_KEY = 'cricapp_inbox_messages';
const UNREAD_COUNT_KEY = 'cricapp_inbox_unread';
const FCM_SUBSCRIBED_KEY = 'cricapp_fcm_subscribed';
const INBOX_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

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
    try {
      // Step 1: Request notification permission
      const authStatus = await messaging().requestPermission();
      const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) {
        console.log('[FCM] Notification permission denied');
        return;
      }

      // Step 2: Get FCM token via @react-native-firebase/messaging
      console.log('[FCM] Getting FCM token via native Firebase...');
      const fcmToken = await messaging().getToken();
      console.log('[FCM] Token obtained:', fcmToken ? `${fcmToken.substring(0, 30)}...` : 'NULL');

      if (!fcmToken) {
        console.warn('[FCM] No FCM token available');
        return;
      }

      // Step 3: Store token locally
      await AsyncStorage.setItem('cricapp_fcm_token', fcmToken);

      // Step 4: Subscribe to 'all_users' topic via native Firebase SDK
      try {
        await messaging().subscribeToTopic('all_users');
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
    // Native Firebase foreground message listener (for FCM messages from console)
    const fcmUnsub = messaging().onMessage(async (remoteMessage) => {
      console.log('[FCM] Foreground message received:', JSON.stringify(remoteMessage));
      const notification = remoteMessage.notification;
      const data = remoteMessage.data || {};
      const type = (data?.type as string) || '';

      // Skip match-related
      if (type === 'match-reminder' || type === 'wicket' || type === 'four' || type === 'six' || type === 'milestone' || type === 'result') {
        return;
      }

      const newMsg: InboxMessage = {
        id: remoteMessage.messageId || `fcm-${Date.now()}`,
        title: notification?.title || (data?.title as string) || 'CricApp',
        body: notification?.body || (data?.body as string) || '',
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

    // Also handle background FCM messages that open the app
    messaging().getInitialNotification().then((remoteMessage) => {
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
    });

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
      fcmUnsub();
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
