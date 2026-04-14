import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInbox } from '../src/context/InboxContext';

// Alternating transparent shades for premium look
const ROW_COLORS = [
  'rgba(76, 175, 80, 0.08)',   // Soft transparent green
  'rgba(244, 67, 54, 0.06)',   // Soft transparent reddish
  'rgba(255, 193, 7, 0.07)',   // Soft transparent yellow
];

// Format timestamp to user's local timezone: DD MMM YYYY, hh:mm AM/PM
const formatMessageDate = (ts: number): string => {
  const d = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const hh = hours.toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${minutes} ${ampm}`;
};

export default function InboxScreen() {
  const router = useRouter();
  const { messages, unreadCount, markAsRead, markAllAsRead, cleanupExpired } = useInbox();

  useEffect(() => {
    // Run 48-hour cleanup when inbox is opened
    cleanupExpired();
    // Mark all as read when user opens inbox
    if (unreadCount > 0) {
      markAllAsRead();
    }
  }, []);

  const renderMessage = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={[
        styles.messageItem,
        { backgroundColor: ROW_COLORS[index % 3] },
        !item.read && styles.messageUnread,
      ]}
      onPress={() => markAsRead(item.id)}
      activeOpacity={0.7}
      data-testid={`inbox-message-${index}`}
    >
      {/* Date Header — Bold, user's local timezone */}
      <Text style={styles.dateHeader} data-testid={`inbox-date-${index}`}>
        {formatMessageDate(item.timestamp)}
      </Text>

      {/* Message Title */}
      <Text style={[styles.messageTitle, !item.read && styles.messageTitleUnread]} numberOfLines={2}>
        {item.title}
      </Text>

      {/* Message Body */}
      <Text style={styles.messageBody}>
        {item.body}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ImageBackground
      source={require('../assets/images/wallpaper.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="inbox-back">
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <Ionicons name="mail-outline" size={20} color="#4CAF50" />
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerCount}>{messages.length} messages</Text>
        </View>

        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="mail-open-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Admin broadcasts will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(34,34,34,0.85)',
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
    gap: 8,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', flex: 1 },
  headerCount: { color: '#999', fontSize: 12 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtext: { color: '#999', fontSize: 14, marginTop: 8 },

  listContent: { paddingVertical: 8 },

  messageItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  messageUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },

  // Bold date header at top of each message
  dateHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 6,
    letterSpacing: 0.3,
  },

  messageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  messageTitleUnread: { color: '#111', fontWeight: '700' },

  messageBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#555',
    textAlign: 'justify' as any,
  },
});
