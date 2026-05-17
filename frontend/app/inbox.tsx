import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInbox } from '../src/context/InboxContext';

// v1.0.17 — solid backgrounds now that the inbox uses pure white (no
// wallpaper bleed). Unread = soft green; Read = pure white card.
const UNREAD_BG = '#E8F5E9'; // light green
const READ_BG = '#FFFFFF';   // white

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
  const { messages, markAsRead, cleanupExpired } = useInbox();

  // Selected message for the detail modal — tapping a row opens this.
  const [selectedMessage, setSelectedMessage] = useState<any>(null);

  useEffect(() => {
    // Run 48-hour cleanup when inbox is opened
    cleanupExpired();
    // NOTE: we intentionally do NOT mark-all-as-read on open anymore — the user
    // wants unread (green) vs read (white) to be meaningful per-message. A row
    // flips to white only once the user taps it (markAsRead fires).
  }, []);

  const handleOpenMessage = (item: any) => {
    setSelectedMessage(item);
    if (!item.read) markAsRead(item.id);
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={[
        styles.messageItem,
        { backgroundColor: item.read ? READ_BG : UNREAD_BG },
        !item.read && styles.messageUnread,
      ]}
      onPress={() => handleOpenMessage(item)}
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

      {/* Message Body (collapsed preview) */}
      <Text style={styles.messageBody} numberOfLines={2}>
        {item.body}
      </Text>

      {/* Tap-to-read affordance */}
      <View style={styles.tapHintRow}>
        <Text style={styles.tapHint}>Tap to read full message</Text>
        <Ionicons name="chevron-forward" size={14} color="#555" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
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

        {/* Full-message detail modal */}
        <Modal
          visible={!!selectedMessage}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMessage(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalDate}>
                  {selectedMessage ? formatMessageDate(selectedMessage.timestamp) : ''}
                </Text>
                <TouchableOpacity onPress={() => setSelectedMessage(null)} data-testid="inbox-modal-close">
                  <Ionicons name="close" size={22} color="#333" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalTitle}>{selectedMessage?.title || ''}</Text>
              <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalBody}>{selectedMessage?.body || ''}</Text>
              </ScrollView>
              <TouchableOpacity style={styles.modalOkBtn} onPress={() => setSelectedMessage(null)}>
                <Text style={styles.modalOkTxt}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

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
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  messageUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#2E7D32',
  },

  dateHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    marginBottom: 4,
    letterSpacing: 0.3,
  },

  messageTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  messageTitleUnread: { color: '#1B5E20', fontWeight: '800' },

  messageBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#444',
  },
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 2,
  },
  tapHint: {
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
  },

  // Detail modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    // v1.0.17 — top-header / Admin-Chat modal background reset to pure
    // white (was legacy off-white '#FAFAFA' which clashed against the
    // wallpaper backdrop). Explicit #FFFFFF for consistency.
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    // Explicit white reset so the legacy off-white never bleeds through
    // when the modal is opened from an Admin broadcast notification.
    backgroundColor: '#FFFFFF',
  },
  modalDate: {
    fontSize: 12,
    color: '#777',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1B5E20',
    marginBottom: 12,
  },
  modalBodyScroll: {
    maxHeight: 340,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#222',
  },
  modalOkBtn: {
    alignSelf: 'flex-end',
    marginTop: 14,
    backgroundColor: '#2E7D32',
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 18,
  },
  modalOkTxt: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
