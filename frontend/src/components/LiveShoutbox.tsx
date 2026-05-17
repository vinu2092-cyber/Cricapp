/**
 * LiveShoutbox — v1.0.17
 *
 * Glass-style chat popup on each match scoreboard. Backed STRICTLY by Firebase
 * Realtime Database (Spark-plan safe). Quick-chat pill buttons (no typing).
 * Targeted reactions including 3 Lottie-only specials (flower/tomato/egg).
 *
 * Strict size budget: no PNG/GIF/MP4. Only tiny local Lottie JSONs (~3 KB each).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  sendMessage,
  subscribeMessages,
  sendReaction,
  subscribeReactions,
  ChatMessage,
} from '../services/ChatRTDB';

// Lottie — wrapped in try so the screen never crashes if the native module
// is unavailable (e.g. inside a JS-only preview).
let LottieView: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LottieView = require('lottie-react-native').default;
} catch {
  LottieView = null;
}

const LOTTIE_TOMATO = require('../../assets/lottie/tomato.json');
const LOTTIE_EGG = require('../../assets/lottie/egg.json');
const LOTTIE_FLOWER = require('../../assets/lottie/flower.json');

const PROFILE_KEY = 'crickapp_chat_profile';

// 12 popular cricket countries + neutral world
const COUNTRIES = ['🇮🇳', '🇵🇰', '🇧🇩', '🇱🇰', '🇦🇺', '🇳🇿', '🇿🇦', '🇮🇪', '🇼🇸', '🇦🇫', '🇿🇼', '🌍'];

// Cricket quick phrases
const PILLS = [
  { txt: 'Six 🔥', msg: 'Six 🔥' },
  { txt: 'Four 🚀', msg: 'Four 🚀' },
  { txt: 'Out ☝️', msg: 'Out ☝️' },
  { txt: 'Duck 🦆', msg: '0 Duck 🦆' },
  { txt: 'Hat-trick 🎯', msg: 'Hat-trick 🎯' },
  { txt: 'Great Shot 🏏', msg: 'Great Shot 🏏' },
  { txt: 'Boring 🥱', msg: 'Boring Match 🥱' },
];

// 29 throwable general emojis (no Lottie, just float-and-bounce)
const THROW_EMOJIS = [
  '🤣', '😛', '🥳', '😭', '🫡', '🤐', '🫢', '🤫', '🤬', '🫣',
  '😱', '😤', '🤯', '🥵', '😇', '😎', '💩', '🎊', '🔥', '💔',
  '💋', '❤️‍🔥', '♥️', '❤️‍🩹', '👎', '👍', '💪', '🫶', '🤝',
];

interface Profile { name: string; country: string }

interface Props {
  matchId: string;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const LiveShoutbox: React.FC<Props> = ({ matchId }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftCountry, setDraftCountry] = useState('🇮🇳');

  const [open, setOpen] = useState(false); // popup visible?
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [targetMsg, setTargetMsg] = useState<ChatMessage | null>(null); // for reaction popup
  const [overlay, setOverlay] = useState<{ kind: 'flower' | 'tomato' | 'egg' | 'emoji'; emoji?: string; targetTop?: number } | null>(null);
  const overlayTimer = useRef<any>(null);

  // Load profile from AsyncStorage on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (mounted && raw) {
          const p = JSON.parse(raw);
          if (p && p.name) setProfile(p);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // Subscribe to messages when popup opens (saves bandwidth)
  useEffect(() => {
    if (!open || !matchId) return;
    setMessages([]);
    const unsub = subscribeMessages(matchId, (m) => {
      setMessages((prev) => {
        const next = [...prev, m];
        return next.slice(-4); // keep latest 4 visible
      });
    });
    return () => { try { unsub(); } catch {} };
  }, [open, matchId]);

  // Subscribe to global reactions when popup is open — to play Lottie overlay
  useEffect(() => {
    if (!open || !matchId) return;
    const seenStart = Date.now();
    const unsub = subscribeReactions(matchId, (r) => {
      // Avoid replaying historical reactions older than the join time
      if (r.time && r.time < seenStart - 5000) return;
      const a = r.action || '';
      let kind: 'flower' | 'tomato' | 'egg' | 'emoji' = 'emoji';
      if (a === '🌹') kind = 'flower';
      else if (a === '🍅') kind = 'tomato';
      else if (a === '🥚') kind = 'egg';
      triggerOverlay({ kind, emoji: a });
    });
    return () => { try { unsub(); } catch {} };
  }, [open, matchId]);

  function triggerOverlay(o: { kind: 'flower' | 'tomato' | 'egg' | 'emoji'; emoji?: string; targetTop?: number }) {
    setOverlay(o);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlay(null), 1400);
  }

  function saveProfile() {
    const cleaned = draftName.replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 12).trim();
    if (!cleaned) return;
    const p: Profile = { name: cleaned, country: draftCountry || '🌍' };
    setProfile(p);
    setShowSetup(false);
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p)).catch(() => {});
  }

  function ensureProfileThen(cb: () => void) {
    if (profile) { cb(); return; }
    setDraftName('');
    setDraftCountry('🇮🇳');
    setShowSetup(true);
  }

  function handlePill(pill: { msg: string }) {
    ensureProfileThen(() => {
      sendMessage(matchId, { name: profile!.name, country: profile!.country, msg: pill.msg });
    });
  }

  function handleReact(emoji: string) {
    if (!profile || !targetMsg) { setTargetMsg(null); return; }
    const from = `${profile.country} ${profile.name}`;
    const to = `${targetMsg.country} ${targetMsg.name}`;
    sendReaction(matchId, { from, to, action: emoji });
    setTargetMsg(null);
  }

  // ============ RENDER ============
  return (
    <>
      {/* Floating chat toggle button — always visible while on the screen */}
      <TouchableOpacity
        onPress={() => {
          if (!profile) { ensureProfileThen(() => setOpen(true)); return; }
          setOpen((v) => !v);
        }}
        style={[styles.fab, open && styles.fabActive]}
        activeOpacity={0.85}
        data-testid="shoutbox-fab"
      >
        <Ionicons name={open ? 'close' : 'chatbubbles'} size={22} color="#FFF" />
      </TouchableOpacity>

      {/* Glass chat popup — overlays scoreboard / commentary but stays translucent */}
      {open && (
        <View pointerEvents="box-none" style={styles.popupWrap}>
          <View style={styles.popup} data-testid="shoutbox-popup">
            <View style={styles.popupHeader}>
              <Text style={styles.popupTitle}>💬 Live Shoutbox</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.headerBtn}>
                <Ionicons name="remove" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Latest 4 messages — auto-fades older ones via opacity ramp */}
            <View style={styles.msgList}>
              {messages.length === 0 ? (
                <Text style={styles.emptyTxt}>Tap a phrase below to chat ⤵</Text>
              ) : messages.map((m, idx) => {
                const opacity = 0.45 + (idx + 1) * (0.55 / Math.max(messages.length, 1));
                const own = profile && m.name === profile.name && m.country === profile.country;
                return (
                  <TouchableOpacity
                    key={m.id + idx}
                    activeOpacity={own ? 1 : 0.7}
                    onPress={() => { if (!own) setTargetMsg(m); }}
                    style={[styles.msgRow, { opacity }]}
                    data-testid={`shoutbox-msg-${idx}`}
                  >
                    <Text style={styles.msgCountry}>{m.country}</Text>
                    <Text style={styles.msgName} numberOfLines={1}>{m.name}:</Text>
                    <Text style={styles.msgTxt} numberOfLines={1}>{m.msg}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Horizontal scrollable cricket pill phrases */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsRow}
              data-testid="shoutbox-pills"
            >
              {PILLS.map((p) => (
                <TouchableOpacity
                  key={p.txt}
                  onPress={() => handlePill(p)}
                  style={styles.pill}
                  activeOpacity={0.75}
                >
                  <Text style={styles.pillTxt}>{p.txt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Profile setup modal — local AsyncStorage only */}
      <Modal visible={showSetup} transparent animationType="fade" onRequestClose={() => setShowSetup(false)}>
        <View style={styles.modalBg}>
          <View style={styles.setupBox}>
            <Text style={styles.setupTitle}>Join Live Chat</Text>
            <Text style={styles.setupHint}>Pick a name (max 12, letters/numbers only)</Text>
            <TextInput
              value={draftName}
              onChangeText={(t) => setDraftName(t.replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 12))}
              placeholder="Your name"
              placeholderTextColor="#999"
              maxLength={12}
              style={styles.nameInput}
              data-testid="shoutbox-name-input"
            />
            <Text style={[styles.setupHint, { marginTop: 12 }]}>Choose your flag</Text>
            <View style={styles.flagsWrap}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setDraftCountry(c)}
                  style={[styles.flagBtn, draftCountry === c && styles.flagBtnActive]}
                >
                  <Text style={styles.flagTxt}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.setupActions}>
              <TouchableOpacity onPress={() => setShowSetup(false)} style={[styles.setupBtn, styles.setupBtnGhost]}>
                <Text style={[styles.setupBtnTxt, { color: '#999' }]}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveProfile}
                style={[styles.setupBtn, !draftName.trim() && { opacity: 0.5 }]}
                disabled={!draftName.trim()}
                data-testid="shoutbox-save-profile"
              >
                <Text style={styles.setupBtnTxt}>Save & Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reaction popup — emojis + 3 lottie specials */}
      <Modal visible={!!targetMsg} transparent animationType="fade" onRequestClose={() => setTargetMsg(null)}>
        <TouchableOpacity activeOpacity={1} style={styles.modalBg} onPress={() => setTargetMsg(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.reactBox} onPress={() => { /* swallow */ }}>
            <Text style={styles.reactTitle}>
              React to {targetMsg?.country} {targetMsg?.name}
            </Text>
            {/* Lottie specials row — highlighted */}
            <View style={styles.specialRow}>
              {[
                { e: '🌹', label: 'Flower' },
                { e: '🍅', label: 'Tomato' },
                { e: '🥚', label: 'Egg' },
              ].map((s) => (
                <TouchableOpacity
                  key={s.e}
                  onPress={() => handleReact(s.e)}
                  style={styles.specialBtn}
                  data-testid={`react-special-${s.label.toLowerCase()}`}
                >
                  <Text style={styles.specialEmoji}>{s.e}</Text>
                  <Text style={styles.specialLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView contentContainerStyle={styles.emojiGrid} showsVerticalScrollIndicator={false}>
              {THROW_EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  onPress={() => handleReact(e)}
                  style={styles.emojiBtn}
                >
                  <Text style={styles.emojiTxt}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Lottie / emoji overlay — full-screen, brief, pointer-events none so it never blocks UI */}
      {overlay && (
        <View pointerEvents="none" style={styles.overlayWrap}>
          {overlay.kind === 'emoji' ? (
            <FlyingEmoji emoji={overlay.emoji || '👏'} />
          ) : (
            <LottiePlayer kind={overlay.kind} />
          )}
        </View>
      )}
    </>
  );
};

// ============ Sub: Lottie player with graceful fallback ============
const LottiePlayer: React.FC<{ kind: 'flower' | 'tomato' | 'egg' }> = ({ kind }) => {
  const src = kind === 'flower' ? LOTTIE_FLOWER : kind === 'tomato' ? LOTTIE_TOMATO : LOTTIE_EGG;
  if (LottieView) {
    return (
      <LottieView
        source={src}
        autoPlay
        loop={false}
        style={styles.lottie}
        resizeMode="contain"
      />
    );
  }
  // Fallback emoji burst if Lottie native module unavailable
  const fallback = kind === 'flower' ? '🌹' : kind === 'tomato' ? '🍅' : '🥚';
  return <FlyingEmoji emoji={fallback} />;
};

// ============ Sub: simple "throw" animation for emojis ============
const FlyingEmoji: React.FC<{ emoji: string }> = ({ emoji }) => {
  const y = useRef(new Animated.Value(SCREEN_H * 0.85)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(y, {
        toValue: SCREEN_H * 0.35,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.6, duration: 500, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    });
  }, []);
  return (
    <Animated.View style={[styles.fly, { transform: [{ translateY: y }, { scale }], opacity }]}>
      <Text style={styles.flyEmoji}>{emoji}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Floating chat toggle FAB
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 90,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1B5E20',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 999,
  },
  fabActive: { backgroundColor: '#C62828' },

  // Popup wrapper (so we can use pointerEvents=box-none and still let touches pass through)
  popupWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 150,
    zIndex: 998,
  },
  popup: {
    backgroundColor: 'rgba(15, 25, 18, 0.55)', // glassy translucent — scoreboard/commentary visible behind
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    // backdropFilter is not supported on RN — semi-opaque BG approximates the glass effect.
  },
  popupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  popupTitle: { color: '#FFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  headerBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },

  msgList: { minHeight: 30, marginBottom: 6 },
  emptyTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontStyle: 'italic' },
  msgRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2, gap: 6 },
  msgCountry: { fontSize: 14 },
  msgName: { color: '#FFE082', fontWeight: '800', fontSize: 12, maxWidth: 110 },
  msgTxt: { color: '#F5F5F5', fontSize: 12, flexShrink: 1 },

  pillsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  pill: {
    backgroundColor: 'rgba(76,175,80,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
  },
  pillTxt: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  // Setup / profile modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  setupBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, width: '100%', maxWidth: 380 },
  setupTitle: { fontSize: 18, fontWeight: '900', color: '#1B5E20', marginBottom: 6 },
  setupHint: { color: '#555', fontSize: 12, marginBottom: 6 },
  nameInput: {
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#212121',
  },
  flagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  flagBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F4F4F4', borderWidth: 1, borderColor: 'transparent' },
  flagBtnActive: { borderColor: '#1B5E20', backgroundColor: '#E8F5E9' },
  flagTxt: { fontSize: 20 },
  setupActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  setupBtn: { backgroundColor: '#1B5E20', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  setupBtnGhost: { backgroundColor: 'transparent' },
  setupBtnTxt: { color: '#FFF', fontWeight: '800' },

  // Reaction popup
  reactBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, width: '92%', maxHeight: SCREEN_H * 0.65 },
  reactTitle: { fontSize: 14, fontWeight: '900', color: '#212121', marginBottom: 10 },
  specialRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  specialBtn: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#FFF8E1', borderRadius: 10, borderWidth: 1, borderColor: '#FFCC80' },
  specialEmoji: { fontSize: 28 },
  specialLabel: { fontSize: 11, fontWeight: '700', color: '#E65100', marginTop: 2 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  emojiBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  emojiTxt: { fontSize: 26 },

  // Overlay (Lottie / flying emoji)
  overlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
  },
  lottie: { width: SCREEN_W * 0.7, height: SCREEN_W * 0.7 },
  fly: { position: 'absolute' },
  flyEmoji: { fontSize: 64 },
});

export default LiveShoutbox;
