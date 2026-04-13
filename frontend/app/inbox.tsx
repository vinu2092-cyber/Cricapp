import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInbox } from '../src/context/InboxContext';

export default function InboxScreen() {
  const router = useRouter();
  const { messages, unreadCount, markAsRead, markAllAsRead } = useInbox();

  useEffect(() => {
    // Mark all as read when user opens inbox
    if (unreadCount > 0) {
      markAllAsRead();
    }
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={[styles.messageItem, !item.read && styles.messageUnread]}
      onPress={() => markAsRead(item.id)}
      activeOpacity={0.7}
      data-testid={`inbox-message-${index}`}
    >
      <View style={styles.messageLeft}>
        <View style={[styles.messageDot, !item.read && styles.messageDotUnread]} />
        <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.messageContent}>
        <Text style={[styles.messageTitle, !item.read && styles.messageTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.messageBody} numberOfLines={3}>
          {item.body}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ImageBackground
      source={require('../assets/images/wallpaper.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.container}>
        {/* Transparent header with back button */}
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

  // Transparent header
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

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtext: { color: '#999', fontSize: 14, marginTop: 8 },

  // Message list
  listContent: { paddingVertical: 8 },

  // Commentary-style message item
  messageItem: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    gap: 12,
  },
  messageUnread: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },

  messageLeft: { width: 50, alignItems: 'center', paddingTop: 2 },
  messageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  messageDotUnread: { backgroundColor: '#4CAF50' },
  messageTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
    textAlign: 'center',
  },

  messageContent: { flex: 1 },
  messageTitle: { fontSize: 15, fontWeight: '600', color: '#555', marginBottom: 4 },
  messageTitleUnread: { color: '#222', fontWeight: '700' },
  messageBody: { fontSize: 14, lineHeight: 20, color: '#666' },
});
