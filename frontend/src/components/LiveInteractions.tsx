/**
 * LiveInteractions — v1.0.17 (rev-8)
 *
 * Critical fixes per user directive 2026-05-17:
 *
 *  1. CHAT NOT SHOWING — fixed at two layers:
 *     • Service: Firebase is now under a NAMED app (`cricapp-rtdb`) so it
 *       never collides with FirebaseKeyService's default app.
 *     • UI: every send does an OPTIMISTIC LOCAL ECHO — the bubble is
 *       inserted into the chat list synchronously. When the RTDB
 *       `onChildAdded` echo arrives, the local placeholder is deduped so
 *       there's no duplicate. Result: instant on-screen feedback even if
 *       the round-trip is slow.
 *
 *  2. RATE LIMIT 3 min → 2 min (`120_000` ms).
 *
 *  3. ACTIVE USERS BAR — now a real horizontal `FlatList`
 *     (`showsHorizontalScrollIndicator={false}`) at the very top of the
 *     chat room, fed by `subscribeActiveUsers` with `.limitToLast(20)`.
 *     Tap any chip → throw popup with 8 items. The position of each chip
 *     is captured via `measureInWindow` so the Lottie / Animated burst
 *     lands on that exact avatar. After a hit, RTDB pushes the target to
 *     index 0 and the FlatList auto-scrolls back to the start so the
 *     freshly-hit user is always visible.
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
  ToastAndroid,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  sendMessage,
  subscribeMessages,
  sendStreamReaction,
  subscribeStreamReactions,
  sendThrow,
  subscribeThrows,
  touchUser,
  subscribeActiveUsers,
  ChatMessage,
  ThrowEvent,
  ActiveUser,
} from '../services/ChatRTDB';

let LottieView: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LottieView = require('lottie-react-native').default;
} catch {
  LottieView = null;
}

const LOTTIE_TOMATO = require('../../assets/lottie/tomato.json');
const LOTTIE_EGG = require('../../assets/lottie/egg.json');
const LOTTIE_CHAPPAL = require('../../assets/lottie/chappal.json');

const PROFILE_KEY = 'crickapp_chat_profile';
const USER_ID_KEY = 'crickapp_chat_user_id';
const RATE_KEY = 'crickapp_chat_last_action';
const MSG_CACHE_KEY = 'crickapp_chat_msgs_v2_'; // + matchId → survives back-nav
const MAX_MSGS = 15; // ← v1.0.17 rev-9: keep last 15 chat bubbles
const RATE_LIMIT_MS = 120_000; // ← v1.0.17 rev-8: 2 minutes
const HEARTBEAT_MS = 60_000;    // ← v1.0.17 rev-9: 1-minute Firebase ↔ app presence sync

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const COUNTRIES = ['🇮🇳', '🇵🇰', '🇧🇩', '🇱🇰', '🇦🇺', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇳🇿', '🇿🇦', '🇮🇪', '🇼🇸', '🇦🇫', '🇿🇼', '🌍'];

// Live Reactions pills
const REACTION_PILLS: { txt: string; flying: string }[] = [
  { txt: '6 🔥', flying: '6 🔥' },
  { txt: '4 🚀', flying: '4 🚀' },
  { txt: 'OUT ☝️', flying: 'OUT ☝️' },
  { txt: 'Duck 🦆', flying: '0 Duck 🦆' },
  { txt: 'Hat-trick 🎯', flying: 'Hat-trick 🎯' },
  { txt: 'Great Shot 🏏', flying: 'Great Shot 🏏' },
  { txt: 'Boring 🥱', flying: 'Boring 🥱' },
  { txt: '😊', flying: '😊' },
  { txt: '😭', flying: '😭' },
];
const REACTION_FLAGS = ['🇮🇳', '🇵🇰', '🇧🇩', '🇱🇰', '🇦🇺', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇿🇦', '🇳🇿'];

// Throw popup — 8 items
const THROW_ITEMS: { key: string; label: string; lottie?: any }[] = [
  { key: '🩴', label: 'Chappal', lottie: LOTTIE_CHAPPAL },
  { key: '💋', label: 'Kiss' },
  { key: '💩', label: 'Potty' },
  { key: '🍅', label: 'Tomato', lottie: LOTTIE_TOMATO },
  { key: '🥚', label: 'Egg', lottie: LOTTIE_EGG },
  { key: '❤️', label: 'Heart' },
  { key: '👋', label: 'Slap' },
  { key: '🙋‍♂️', label: 'Hii' },
];

function teamNameToFlag(name?: string): string {
  if (!name) return '🏳️';
  const n = name.toLowerCase();
  if (/\bindia\b|^ind$/.test(n)) return '🇮🇳';
  if (/\bpakistan\b|^pak$/.test(n)) return '🇵🇰';
  if (/\bbangladesh\b|^ban$/.test(n)) return '🇧🇩';
  if (/\bsri lanka\b|^sl$/.test(n)) return '🇱🇰';
  if (/\baustralia\b|^aus$/.test(n)) return '🇦🇺';
  if (/\bengland\b|^eng$/.test(n)) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
  if (/\bnew zealand\b|^nz$/.test(n)) return '🇳🇿';
  if (/\bsouth africa\b|^sa$/.test(n)) return '🇿🇦';
  if (/\bwest indies\b|^wi$/.test(n)) return '🌴';
  if (/\bafghanistan\b|^afg$/.test(n)) return '🇦🇫';
  if (/\bzimbabwe\b|^zim$/.test(n)) return '🇿🇼';
  if (/\bireland\b|^ire$/.test(n)) return '🇮🇪';
  if (/\bnetherlands\b|^ned$|^nl$/.test(n)) return '🇳🇱';
  if (/\bnepal\b|^nep$/.test(n)) return '🇳🇵';
  if (/\bscotland\b|^sco$/.test(n)) return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  if (/\boman\b|^oma$/.test(n)) return '🇴🇲';
  if (/\bnamibia\b|^nam$/.test(n)) return '🇳🇦';
  if (/\bemirates\b|\buae\b/.test(n)) return '🇦🇪';
  return '🏳️';
}

function genUserId(): string {
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function showToast(msg: string) {
  if (Platform.OS === 'android') {
    try { ToastAndroid.show(msg, ToastAndroid.SHORT); } catch {}
  } else {
    console.log('[Toast]', msg);
  }
}

interface Props { matchId: string; team1?: string; team2?: string; team1Short?: string; team2Short?: string }
interface Profile { name: string; country: string }

const LiveInteractions: React.FC<Props> = ({ matchId, team1, team2, team1Short, team2Short }) => {
  const [activePanel, setActivePanel] = useState<'reactions' | 'chat' | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string>('');
  const userIdRef = useRef<string>('');
  const [showSetup, setShowSetup] = useState(false);
  const [pendingAfter, setPendingAfter] = useState<null | 'chat' | { kind: 'sendMsg'; msg: string } | { kind: 'throw'; target: ActiveUser; action: string }>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [throwTarget, setThrowTarget] = useState<ActiveUser | null>(null);

  const [flying, setFlying] = useState<{ id: string; e: string; dur: number; lane: number }[]>([]);
  const [activeThrows, setActiveThrows] = useState<{ id: string; t: ThrowEvent }[]>([]);

  const prevTopRef = useRef<string>('');
  const userPositionsRef = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const chipRefsMap = useRef<Record<string, View | null>>({});
  const msgScrollRef = useRef<ScrollView | null>(null);
  const activeListRef = useRef<FlatList<ActiveUser> | null>(null);
  const lastActionRef = useRef<number>(0);

  // ============ Load profile + userId + last-action ============
  useEffect(() => {
    (async () => {
      try {
        const [rawP, rawId, rawLast] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(USER_ID_KEY),
          AsyncStorage.getItem(RATE_KEY),
        ]);
        let uid = rawId;
        if (!uid) {
          uid = genUserId();
          AsyncStorage.setItem(USER_ID_KEY, uid).catch(() => {});
        }
        userIdRef.current = uid;
        setUserId(uid);
        if (rawP) {
          const p = JSON.parse(rawP);
          if (p && p.name) setProfile(p);
        }
        if (rawLast) lastActionRef.current = parseInt(rawLast) || 0;
      } catch {}
    })();
  }, []);

  // ============ Predictive cricket pills (dynamic team flags + short names) ============
  const chatPills = React.useMemo<string[]>(() => {
    const f1 = teamNameToFlag(team1 || team1Short);
    const f2 = teamNameToFlag(team2 || team2Short);
    const s1 = (team1Short || '').trim();
    const s2 = (team2Short || '').trim();
    const t1 = s1 ? `${f1} ${s1}` : f1;
    const t2 = s2 ? `${f2} ${s2}` : f2;
    return [
      `${t1} will win`,
      `${t2} will loss`,
      'Hat-trick in this over 🔥',
      'Four in this over 🚀',
      'Out in this over ☝️',
      'Review taken 📺',
      'Catch dropped! 🤦‍♂️',
      'Match turning point! 🔄',
    ];
  }, [team1, team2, team1Short, team2Short]);

  // ============ Flying-emoji listener (always) ============
  useEffect(() => {
    if (!matchId) return;
    const joined = Date.now();
    const unsub = subscribeStreamReactions(matchId, (r) => {
      if (r.t && r.t < joined - 8000) return;
      spawnFlying(r.e);
    });
    return () => { try { unsub(); } catch {} };
  }, [matchId]);

  // ============ Throws listener (always) ============
  useEffect(() => {
    if (!matchId) return;
    const joined = Date.now();
    const unsub = subscribeThrows(matchId, (t) => {
      if (t.time && t.time < joined - 8000) return;
      const id = `throw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      // capture latest position of target chip before the burst plays
      const ref = chipRefsMap.current[t.toId];
      if (ref && (ref as any).measureInWindow) {
        (ref as any).measureInWindow((x: number, y: number, w: number, h: number) => {
          userPositionsRef.current[t.toId] = { x, y, w, h };
          setActiveThrows((cur) => [...cur, { id, t }]);
        });
      } else {
        setActiveThrows((cur) => [...cur, { id, t }]);
      }
      setTimeout(() => setActiveThrows((cur) => cur.filter((x) => x.id !== id)), 1800);
    });
    return () => { try { unsub(); } catch {} };
  }, [matchId]);

  // ============ Active users (when chat is open) ============
  useEffect(() => {
    if (activePanel !== 'chat' || !matchId) return;
    if (profile && userIdRef.current) {
      touchUser(matchId, userIdRef.current, profile.name, profile.country);
    }
    const unsub = subscribeActiveUsers(matchId, (users) => setActiveUsers(users));
    const heartbeat = setInterval(() => {
      if (profile && userIdRef.current) {
        touchUser(matchId, userIdRef.current, profile.name, profile.country);
      }
    }, HEARTBEAT_MS);
    return () => { try { unsub(); } catch {} ; clearInterval(heartbeat); };
  }, [activePanel, matchId, profile]);

  // ============ Scroll FlatList back to index 0 when top user changes (hit) ============
  useEffect(() => {
    const topId = activeUsers[0]?.id || '';
    if (topId && topId !== prevTopRef.current) {
      prevTopRef.current = topId;
      try { activeListRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch {}
    }
  }, [activeUsers]);

  // ============ Chat messages subscribe — with persistence + dedupe vs optimistic echo ============
  // Load cached messages on mount so chat survives navigation (back → re-enter screen).
  useEffect(() => {
    if (!matchId) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(MSG_CACHE_KEY + matchId);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) setMessages(arr.slice(-MAX_MSGS));
        }
      } catch {}
    })();
  }, [matchId]);

  // Persist messages whenever they change.
  useEffect(() => {
    if (!matchId || messages.length === 0) return;
    AsyncStorage.setItem(MSG_CACHE_KEY + matchId, JSON.stringify(messages.slice(-MAX_MSGS))).catch(() => {});
  }, [messages, matchId]);

  useEffect(() => {
    if (activePanel !== 'chat' || !matchId) return;
    // NOTE: do NOT reset state — keeps the bubbles visible across panel toggles
    //       and across full screen navigations (cache already restored above).
    const unsub = subscribeMessages(matchId, (m) => {
      setMessages((prev) => {
        // De-duplicate against any optimistic local echo (same name+country+msg)
        const isMine = profile && m.name === profile.name && m.country === profile.country;
        let filtered = prev;
        if (isMine) {
          filtered = prev.filter((p) =>
            !(p.id.startsWith('local_') && p.name === m.name && p.country === m.country && p.msg === m.msg)
          );
        }
        // Also dedupe by RTDB key (in case subscribe fires twice for same id)
        if (filtered.some((p) => p.id === m.id)) return filtered;
        const next = [...filtered, m].slice(-MAX_MSGS);
        return next;
      });
      setTimeout(() => { try { msgScrollRef.current?.scrollToEnd({ animated: true }); } catch {} }, 50);
    });
    return () => { try { unsub(); } catch {} };
  }, [activePanel, matchId, profile]);

  // ============ Helpers ============
  function spawnFlying(label: string) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const dur = 2500 + Math.floor(Math.random() * 3000);
    const lane = Math.floor(Math.random() * 5);
    setFlying((cur) => [...cur, { id, e: label, dur, lane }]);
    setTimeout(() => setFlying((cur) => cur.filter((x) => x.id !== id)), dur + 400);
  }

  function ensureUserId(): string {
    if (userIdRef.current) return userIdRef.current;
    const uid = genUserId();
    userIdRef.current = uid;
    setUserId(uid);
    AsyncStorage.setItem(USER_ID_KEY, uid).catch(() => {});
    return uid;
  }

  function checkRate(): boolean {
    const elapsed = Date.now() - lastActionRef.current;
    if (elapsed < RATE_LIMIT_MS) {
      const rem = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      showToast(`Please wait ${m}m ${s}s before sending again.`);
      return false;
    }
    return true;
  }
  function markRate() {
    const now = Date.now();
    lastActionRef.current = now;
    AsyncStorage.setItem(RATE_KEY, String(now)).catch(() => {});
  }

  function saveProfile(name: string, country: string) {
    const cleaned = name.replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 12).trim();
    if (!cleaned) return;
    const p: Profile = { name: cleaned, country: country || '🌍' };
    setProfile(p);
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p)).catch(() => {});
    setShowSetup(false);

    const uid = ensureUserId();
    if (pendingAfter === 'chat') {
      setActivePanel('chat');
    } else if (pendingAfter && typeof pendingAfter === 'object') {
      if (pendingAfter.kind === 'sendMsg') {
        if (checkRate()) {
          pushLocalAndSend(p, uid, pendingAfter.msg);
          markRate();
        }
      } else if (pendingAfter.kind === 'throw') {
        if (checkRate()) {
          sendThrow(matchId, {
            from: `${p.country} ${p.name}`, fromId: uid,
            to: `${pendingAfter.target.country} ${pendingAfter.target.name}`, toId: pendingAfter.target.id,
            action: pendingAfter.action,
          });
          markRate();
        }
      }
    }
    setPendingAfter(null);
  }

  /** Optimistic local echo + RTDB push — fixes the "message never appears" bug. */
  function pushLocalAndSend(p: Profile, uid: string, msg: string) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const localMsg: ChatMessage = {
      id: localId, name: p.name, country: p.country, msg, time: Date.now(),
    };
    setMessages((prev) => [...prev, localMsg].slice(-MAX_MSGS));
    setTimeout(() => { try { msgScrollRef.current?.scrollToEnd({ animated: true }); } catch {} }, 30);
    sendMessage(matchId, { name: p.name, country: p.country, msg, userId: uid });
  }

  function openReactions() { setActivePanel((c) => (c === 'reactions' ? null : 'reactions')); }
  function openChat() {
    if (!profile) { setPendingAfter('chat'); setShowSetup(true); return; }
    setActivePanel((c) => (c === 'chat' ? null : 'chat'));
  }

  function handlePillReaction(label: string) {
    sendStreamReaction(matchId, label);
    spawnFlying(label);
  }

  function handleSendChat(msg: string) {
    if (!profile) { setPendingAfter({ kind: 'sendMsg', msg }); setShowSetup(true); return; }
    if (!checkRate()) return;
    const uid = ensureUserId();
    pushLocalAndSend(profile, uid, msg);
    markRate();
  }

  function handleThrowAt(target: ActiveUser, action: string) {
    if (!profile) {
      setPendingAfter({ kind: 'throw', target, action });
      setShowSetup(true);
      setThrowTarget(null);
      return;
    }
    if (!checkRate()) { setThrowTarget(null); return; }
    const uid = ensureUserId();
    sendThrow(matchId, {
      from: `${profile.country} ${profile.name}`, fromId: uid,
      to: `${target.country} ${target.name}`, toId: target.id,
      action,
    });
    markRate();
    setThrowTarget(null);
  }

  // ============ RENDER ============
  return (
    <>
      {/* FAB column */}
      <View style={styles.fabColumn} pointerEvents="box-none">
        <TouchableOpacity onPress={openReactions} activeOpacity={0.8}
          style={[styles.fab, styles.fabReact, activePanel === 'reactions' && styles.fabActive]}
          data-testid="reactions-fab">
          <Ionicons name={activePanel === 'reactions' ? 'close' : 'flame'} size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={openChat} activeOpacity={0.8}
          style={[styles.fab, styles.fabChat, activePanel === 'chat' && styles.fabActive]}
          data-testid="chat-fab">
          <Ionicons name={activePanel === 'chat' ? 'close' : 'chatbubbles'} size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Reactions Panel */}
      {activePanel === 'reactions' && (
        <View style={styles.reactionsDock} data-testid="reactions-panel">
          <View style={styles.dockHeader}>
            <Text style={styles.panelTitle}>🔥 Live Reactions</Text>
            <Text style={styles.panelHint}>Tap → flies globally</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow} keyboardShouldPersistTaps="handled">
            {REACTION_PILLS.map((p) => (
              <TouchableOpacity key={p.txt} onPress={() => handlePillReaction(p.flying)}
                activeOpacity={0.7} style={styles.pill}>
                <Text style={styles.pillTxt}>{p.txt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.pillsRow, { marginTop: 4 }]} keyboardShouldPersistTaps="handled">
            {REACTION_FLAGS.map((f) => (
              <TouchableOpacity key={f} onPress={() => handlePillReaction(f)}
                activeOpacity={0.7} style={[styles.pill, styles.pillFlag]}>
                <Text style={styles.pillFlagTxt}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Chat Room */}
      {activePanel === 'chat' && (
        <View style={styles.chatDock} data-testid="chat-panel">
          {/* ─── Horizontal Active Users FlatList (limitToLast 20) ─── */}
          <View style={styles.activeBar}>
            <FlatList
              ref={activeListRef}
              data={activeUsers}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u) => u.id}
              contentContainerStyle={styles.activeBarContent}
              renderItem={({ item, index }) => {
                const isSelf = item.id === userIdRef.current;
                return (
                  <TouchableOpacity
                    ref={(r) => { chipRefsMap.current[item.id] = r; }}
                    onPress={() => {
                      if (isSelf) return;
                      // capture absolute window position right before opening popup
                      const refEl: any = chipRefsMap.current[item.id];
                      if (refEl?.measureInWindow) {
                        refEl.measureInWindow((x: number, y: number, w: number, h: number) => {
                          userPositionsRef.current[item.id] = { x, y, w, h };
                        });
                      }
                      setThrowTarget(item);
                    }}
                    onLayout={() => {
                      const refEl: any = chipRefsMap.current[item.id];
                      if (refEl?.measureInWindow) {
                        refEl.measureInWindow((x: number, y: number, w: number, h: number) => {
                          userPositionsRef.current[item.id] = { x, y, w, h };
                        });
                      }
                    }}
                    activeOpacity={isSelf ? 1 : 0.7}
                    style={[styles.activeChip, isSelf && styles.activeChipSelf, index === 0 && styles.activeChipTop]}
                    data-testid={`active-user-${item.id}`}
                  >
                    {index === 0 && !isSelf && <Text style={styles.activeRank}>🥇</Text>}
                    <Text style={styles.activeFlag}>{item.country}</Text>
                    <Text style={styles.activeName} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* Messages — newest at bottom */}
          <ScrollView
            ref={msgScrollRef}
            style={styles.msgScroll}
            contentContainerStyle={styles.msgScrollContent}
            onContentSizeChange={() => { try { msgScrollRef.current?.scrollToEnd({ animated: false }); } catch {} }}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m, idx) => {
              const own = !!(profile && m.name === profile.name && m.country === profile.country);
              const isPending = m.id.startsWith('local_');
              return (
                <View key={m.id + idx} style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}
                      data-testid={`chat-msg-${idx}`}>
                  {!own && <Text style={styles.bubbleHeader}>{m.country} {m.name}</Text>}
                  <Text style={[styles.bubbleMsg, own && { color: '#FFFFFF' }]}>
                    {m.msg}{isPending ? ' ⏳' : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Predictive cricket pill phrases */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}
            keyboardShouldPersistTaps="handled"
            style={styles.chatPillsWrap}
          >
            {chatPills.map((msg) => (
              <TouchableOpacity key={msg} onPress={() => handleSendChat(msg)}
                activeOpacity={0.7} style={[styles.pill, styles.chatPill]}
                data-testid={`chat-pill-${msg}`}>
                <Text style={styles.pillTxt}>{msg}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Profile Setup */}
      <Modal visible={showSetup} transparent animationType="fade" onRequestClose={() => setShowSetup(false)}>
        <SetupForm onCancel={() => { setShowSetup(false); setPendingAfter(null); }} onSave={saveProfile} />
      </Modal>

      {/* Throw Picker — 8 items */}
      <Modal visible={!!throwTarget} transparent animationType="fade" onRequestClose={() => setThrowTarget(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setThrowTarget(null)} style={styles.modalBg}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.throwBox}>
            <Text style={styles.throwTitle}>Throw at {throwTarget?.country} {throwTarget?.name}</Text>
            <View style={styles.throwGrid}>
              {THROW_ITEMS.map((t) => (
                <TouchableOpacity key={t.key} onPress={() => throwTarget && handleThrowAt(throwTarget, t.key)}
                  activeOpacity={0.7} style={styles.throwItem}
                  data-testid={`throw-${t.label.toLowerCase()}`}>
                  <Text style={styles.throwEmoji}>{t.key}</Text>
                  <Text style={styles.throwLabel}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.throwHint}>Jumps to #1 in the active list when hit 🎯</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Flying overlay */}
      <View style={styles.flyOverlay} pointerEvents="none">
        {flying.map((f) => (
          <FlyingLabel key={f.id} label={f.e} duration={f.dur} lane={f.lane} />
        ))}
      </View>

      {/* Throw bursts */}
      <View style={styles.throwOverlay} pointerEvents="none">
        {activeThrows.map(({ id, t }) => (
          <ThrowBurst
            key={id}
            action={t.action}
            position={userPositionsRef.current[t.toId]}
            fallbackLabel={t.to}
          />
        ))}
      </View>
    </>
  );
};

// ─── SETUP FORM ─────────────────────────────────────────────────
const SetupForm: React.FC<{ onCancel: () => void; onSave: (name: string, country: string) => void }> = ({ onCancel, onSave }) => {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('🇮🇳');
  return (
    <View style={styles.modalBg}>
      <View style={styles.setupBox}>
        <Text style={styles.setupTitle}>Join Chat Room</Text>
        <Text style={styles.setupHint}>Pick a name (max 12, letters/numbers only)</Text>
        <TextInput
          value={name}
          onChangeText={(t) => setName(t.replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 12))}
          placeholder="Your name"
          placeholderTextColor="#999"
          maxLength={12}
          style={styles.nameInput}
        />
        <Text style={[styles.setupHint, { marginTop: 12 }]}>Choose your flag</Text>
        <View style={styles.flagsWrap}>
          {COUNTRIES.map((c) => (
            <TouchableOpacity key={c} onPress={() => setCountry(c)} style={[styles.flagBtn, country === c && styles.flagBtnActive]}>
              <Text style={styles.flagTxt}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.setupActions}>
          <TouchableOpacity onPress={onCancel} style={[styles.setupBtn, styles.setupBtnGhost]}>
            <Text style={[styles.setupBtnTxt, { color: '#999' }]}>Later</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onSave(name, country)} disabled={!name.trim()}
            style={[styles.setupBtn, !name.trim() && { opacity: 0.5 }]}>
            <Text style={styles.setupBtnTxt}>Save & Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ─── Flying text+emoji label ────────────────────────────────────
const FlyingLabel: React.FC<{ label: string; duration: number; lane: number }> = ({ label, duration, lane }) => {
  const y = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const laneX = (SCREEN_W / 6) * (lane + 1) - 40;
  useEffect(() => {
    const swayAmp = 22 + Math.random() * 38;
    Animated.parallel([
      Animated.timing(y, { toValue: -(SCREEN_H * 0.85), duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(x, { toValue: swayAmp, duration: duration / 4, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(x, { toValue: -swayAmp, duration: duration / 4, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        { iterations: 2 },
      ),
      Animated.timing(rotate, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  }, []);
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] });
  const scale = 0.9 + Math.random() * 0.4;
  return (
    <Animated.View style={[styles.flyItem, { left: laneX, transform: [{ translateY: y }, { translateX: x }, { rotate: spin }, { scale }], opacity }]}>
      <View style={styles.flyBubble}>
        <Text style={styles.flyText}>{label}</Text>
      </View>
    </Animated.View>
  );
};

// ─── ThrowBurst — bursts on absolute chip position ──────────────
const ThrowBurst: React.FC<{
  action: string;
  position?: { x: number; y: number; w: number; h: number };
  fallbackLabel: string;
}> = ({ action, position, fallbackLabel }) => {
  const lottieItem = THROW_ITEMS.find((t) => t.key === action && !!t.lottie);
  const hasPos = !!position;
  const splashSize = hasPos ? 140 : Math.min(SCREEN_W * 0.7, 280);
  // Absolute window coordinates from measureInWindow → top-left of splash
  const left = hasPos ? Math.max(4, position!.x + position!.w / 2 - splashSize / 2) : (SCREEN_W - splashSize) / 2;
  const top  = hasPos ? Math.max(40, position!.y + position!.h / 2 - splashSize / 2) : SCREEN_H * 0.3;

  if (lottieItem && LottieView) {
    return (
      <>
        <View pointerEvents="none" style={[styles.burstWrap, { left, top, width: splashSize, height: splashSize }]}>
          <LottieView source={lottieItem.lottie} autoPlay loop={false} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
        {!hasPos && (
          <View pointerEvents="none" style={[styles.burstLabel, { top: top + splashSize - 8 }]}>
            <Text style={styles.burstLabelTxt}>{action}  on  {fallbackLabel}</Text>
          </View>
        )}
      </>
    );
  }
  return (
    <EmojiBurst emoji={action} left={left} top={top} size={splashSize}
      showFallbackLabel={!hasPos} fallbackLabel={fallbackLabel} />
  );
};

const EmojiBurst: React.FC<{ emoji: string; left: number; top: number; size: number; showFallbackLabel: boolean; fallbackLabel: string }> = ({ emoji, left, top, size, showFallbackLabel, fallbackLabel }) => {
  const scale = useRef(new Animated.Value(0.1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.6, duration: 350, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 1500, easing: Easing.in(Easing.quad), useNativeDriver: true, delay: 300 }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(rotate, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(rotate, { toValue: -1, duration: 200, useNativeDriver: true }),
        ]),
        { iterations: 4 },
      ),
    ]).start();
  }, []);
  const r = rotate.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.burstWrap, { left, top, width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale }, { rotate: r }], opacity }]}>
        <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
      </Animated.View>
      {showFallbackLabel && (
        <View pointerEvents="none" style={[styles.burstLabel, { top: top + size - 8 }]}>
          <Text style={styles.burstLabelTxt}>{emoji}  on  {fallbackLabel}</Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  fabColumn: { position: 'absolute', right: 12, bottom: 80, alignItems: 'center', gap: 12, zIndex: 9999, elevation: 24 },
  fab: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 12, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  fabReact: { backgroundColor: '#E65100' },
  fabChat: { backgroundColor: '#1B5E20' },
  fabActive: { backgroundColor: '#C62828' },

  reactionsDock: { position: 'absolute', left: 8, right: 78, bottom: 80, backgroundColor: 'rgba(20, 40, 18, 0.78)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,140,40,0.5)', paddingVertical: 8, paddingHorizontal: 10, zIndex: 9998, elevation: 20 },
  dockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  panelTitle: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  panelHint: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontStyle: 'italic' },

  chatDock: { position: 'absolute', left: 8, right: 8, bottom: 80, height: 460, backgroundColor: 'rgba(8, 18, 12, 0.92)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', padding: 10, zIndex: 9998, elevation: 20 },

  activeBar: { marginTop: 4, marginBottom: 6, height: 52 },
  activeBarContent: { alignItems: 'center', paddingHorizontal: 4, gap: 6 },
  activeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 22, gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', marginRight: 6 },
  activeChipSelf: { backgroundColor: 'rgba(76,175,80,0.55)', borderColor: '#A5D6A7' },
  activeChipTop: { borderColor: '#FFD54F', borderWidth: 2 },
  activeRank: { fontSize: 14, marginRight: 2 },
  activeFlag: { fontSize: 18 },
  activeName: { color: '#FFF', fontWeight: '700', fontSize: 12, maxWidth: 90 },
  activeEmpty: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontStyle: 'italic', paddingHorizontal: 12, paddingVertical: 14 },

  msgScroll: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4 },
  msgScrollContent: { paddingVertical: 6 },
  emptyTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 14 },
  bubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginBottom: 6, maxWidth: '85%' },
  bubbleOther: { backgroundColor: '#FFF', alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  bubbleOwn: { backgroundColor: '#1976D2', alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  bubbleHeader: { color: '#1B5E20', fontWeight: '900', fontSize: 11, marginBottom: 2 },
  bubbleMsg: { fontSize: 13, color: '#212121', fontWeight: '600' },

  chatPillsWrap: { maxHeight: 50, marginTop: 6 },
  pillsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8, paddingRight: 12 },
  pill: { backgroundColor: 'rgba(76,175,80,0.95)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 6, elevation: 4 },
  pillFlag: { backgroundColor: 'rgba(255,193,7,0.9)' },
  pillFlagTxt: { fontSize: 18 },
  chatPill: { backgroundColor: 'rgba(33, 150, 243, 0.95)' },
  pillTxt: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  setupBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, width: '100%', maxWidth: 380 },
  setupTitle: { fontSize: 18, fontWeight: '900', color: '#1B5E20', marginBottom: 6 },
  setupHint: { color: '#555', fontSize: 12, marginBottom: 6 },
  nameInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 15, color: '#212121' },
  flagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  flagBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F4F4F4', borderWidth: 1, borderColor: 'transparent' },
  flagBtnActive: { borderColor: '#1B5E20', backgroundColor: '#E8F5E9' },
  flagTxt: { fontSize: 20 },
  setupActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  setupBtn: { backgroundColor: '#1B5E20', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  setupBtnGhost: { backgroundColor: 'transparent' },
  setupBtnTxt: { color: '#FFF', fontWeight: '800' },

  throwBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, width: '92%', maxWidth: 380 },
  throwTitle: { fontSize: 15, fontWeight: '900', color: '#212121', marginBottom: 12, textAlign: 'center' },
  throwGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 8, marginBottom: 12 },
  throwItem: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1, borderColor: '#FFCC80', width: '22%', minWidth: 70 },
  throwEmoji: { fontSize: 28 },
  throwLabel: { fontSize: 10, fontWeight: '700', color: '#E65100', marginTop: 2 },
  throwHint: { color: '#999', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },

  flyOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, elevation: 2 },
  flyItem: { position: 'absolute', bottom: 100 },
  flyBubble: { backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', elevation: 3 },
  flyText: { fontSize: 18, fontWeight: '900', color: '#212121' },

  throwOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, elevation: 3 },
  burstWrap: { position: 'absolute' },
  burstLabel: { position: 'absolute', alignSelf: 'center', left: 0, right: 0, alignItems: 'center' },
  burstLabelTxt: { backgroundColor: 'rgba(0,0,0,0.78)', color: '#FFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 18, fontSize: 12, fontWeight: '800' },
});

export default LiveInteractions;
