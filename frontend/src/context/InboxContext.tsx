import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const INBOX_STORAGE_KEY = 'cricapp_inbox_messages';
const UNREAD_COUNT_KEY = 'cricapp_inbox_unread';
const FCM_SUBSCRIBED_KEY = 'cricapp_fcm_subscribed';

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
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

export const InboxProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load messages from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(INBOX_STORAGE_KEY);
        if (stored) {
          const msgs: InboxMessage[] = JSON.parse(stored);
          setMessages(msgs);
          setUnreadCount(msgs.filter(m => !m.read).length);
        }
      } catch {}
    })();
  }, []);

  // Subscribe to FCM 'all_users' topic on first launch
  useEffect(() => {
    subscribeFCMTopic();
  }, []);

  const subscribeFCMTopic = async () => {
    try {
      const alreadySubscribed = await AsyncStorage.getItem(FCM_SUBSCRIBED_KEY);
      if (alreadySubscribed === 'true') return;

      // Get device push token (FCM token on Android)
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const fcmToken = tokenData?.data;
      if (!fcmToken) return;

      console.log('[FCM] Got device token, subscribing to all_users topic...');

      // Send to backend for topic subscription
      const Constants = require('expo-constants').default;
      const backendUrl = Constants.expoConfig?.extra?.backendUrl || '';

      if (backendUrl) {
        const res = await fetch(`${backendUrl}/api/fcm/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fcmToken, topic: 'all_users' }),
        });
        if (res.ok) {
          await AsyncStorage.setItem(FCM_SUBSCRIBED_KEY, 'true');
          console.log('[FCM] Successfully subscribed to all_users topic');
        }
      }
    } catch (err) {
      console.warn('[FCM] Topic subscription failed (non-fatal):', err);
    }
  };

  // Listen for incoming notifications and store in inbox
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = content.data || {};

      // Only store admin broadcast messages in inbox (not match alerts)
      const type = data?.type || '';
      if (type === 'match-reminder' || type === 'wicket' || type === 'four' || type === 'six' || type === 'milestone' || type === 'result') {
        return; // Skip match-related notifications from inbox
      }

      const newMsg: InboxMessage = {
        id: notification.request.identifier || `msg-${Date.now()}`,
        title: content.title || 'CricApp',
        body: content.body || '',
        timestamp: Date.now(),
        read: false,
        data,
      };

      setMessages(prev => {
        const updated = [newMsg, ...prev].slice(0, 100); // Keep max 100 messages
        AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setUnreadCount(prev => prev + 1);
    });

    return () => sub.remove();
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

  return (
    <InboxContext.Provider value={{ messages, unreadCount, markAsRead, markAllAsRead, clearInbox }}>
      {children}
    </InboxContext.Provider>
  );
};

export const useInbox = (): InboxContextType => {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInbox must be inside InboxProvider');
  return ctx;
};
