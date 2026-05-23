/**
 * LiveInteractions — v1.0.19
 *
 * Major chatroom redesign per user directive (2026-05-23):
 *
 *  A. Setup form: country picker REPLACED with **supporting-team picker**
 *     (per-match). Avatar capsule renders team short-code on top and user
 *     name on the bottom. Setup pops up every match because team mapping
 *     changes per match.
 *
 *  B. Online users split-screen: **Team 1 supporters on the LEFT column,
 *     Team 2 supporters on the RIGHT column** — each scrollable.
 *
 *  C. Recipient float-to-top: any user who *receives* an emoji floats to
 *     the top of their team column via RTDB `lastEmojiAt` write.
 *     Multiple receivers can be at the top simultaneously (4–5 visible).
 *
 *  D. **Live emoji flight**: when a throw event arrives, the chosen emoji
 *     visibly flies from the sender's capsule position → receiver's
 *     capsule position (700–900 ms arc), then bursts on the receiver.
 *
 *  E. Center area between the two columns shows a **live event feed**
 *     mixing chat messages and throw events
 *     ("Aman 🩴→ Babar", "Rohit: 'Hat-trick!'") in chronological order.
 *
 * Backward compat preserved:
 *  – Existing throw burst (Lottie + EmojiBurst) untouched
 *  – Stream flying reactions (bottom-up) untouched
 *  – Rate limiting, AsyncStorage caching, FAB column unchanged
 *  – Old RTDB documents without `team` field render as "neutral" capsules
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
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
// Lottie only loads on native — web build uses dotlottie-react which is unsupported
// The try-catch alone isn't enough for Metro which evaluates all requires statically
// So we guard with Platform.OS check before the require
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    LottieView = require('lottie-react-native').default;
  } catch {
    LottieView = null;
  }
}

// Only attempt to load Lottie JSON on native platforms
const LOTTIE_TOMATO = Platform.OS !== 'web' ? require('../../assets/lottie/tomato.json') : null;
const LOTTIE_EGG = Platform.OS !== 'web' ? require('../../assets/lottie/egg.json') : null;
const LOTTIE_CHAPPAL = Platform.OS !== 'web' ? require('../../assets/lottie/chappal.json') : null;

// ============ STORAGE KEYS ============
// v2 key namespace stores team-aware profile per match (since supporting
// team is match-specific). The legacy v1 PROFILE_KEY is read for first-time
// migration so returning users don't have to retype their name.
const LEGACY_PROFILE_KEY = 'crickapp_chat_profile';
const NAME_MEMORY_KEY = 'crickapp_chat_name_v2'; // remember chosen name across matches
const PROFILE_KEY_FOR = (matchId: string) => `crickapp_chat_profile_v2_${matchId || 'global'}`;
const USER_ID_KEY = 'crickapp_chat_user_id';
const RATE_KEY = 'crickapp_chat_last_action';
const MSG_CACHE_KEY = 'crickapp_chat_msgs_v2_';
const FEED_CACHE_KEY = 'crickapp_chat_feed_v3_';
const MAX_MSGS = 15;
const MAX_FEED = 25;
const RATE_LIMIT_MS = 120_000;
const HEARTBEAT_MS = 60_000;
const EMOJI_FLIGHT_MS = 800;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Team palette — kept theatre-bright so they read fast at a glance
const TEAM1_COLOR = '#1976D2'; // royal blue
const TEAM1_DARK = '#0D47A1';
const TEAM2_COLOR = '#E64A19'; // deep orange
const TEAM2_DARK = '#BF360C';
const NEUTRAL_COLOR = '#616161';

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

function shortenTeamName(full?: string, short?: string): string {
  if (short && short.trim()) return short.trim().toUpperCase().slice(0, 4);
  if (full && full.trim()) {
    const words = full.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.map(w => w[0]).join('').slice(0, 4).toUpperCase();
  }
  return '?';
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

// ============ TYPES ============
interface Props {
  matchId: string;
  team1?: string;
  team2?: string;
  team1Short?: string;
  team2Short?: string;
}

interface Profile { name: string; team: '1' | '2'; country: string }

type FeedEvent =
  | { kind: 'msg'; id: string; time: number; name: string; country: string; team?: '1' | '2'; msg: string }
  | { kind: 'throw'; id: string; time: number; from: string; to: string; fromTeam?: '1' | '2'; toTeam?: '1' | '2'; action: string };

type PendingAction =
  | null
  | 'chat'
  | { kind: 'sendMsg'; msg: string }
  | { kind: 'throw'; target: ActiveUser; action: string };

interface ChipBox { x: number; y: number; w: number; h: number }
interface FlightItem { id: string; from: ChipBox; to: ChipBox; emoji: string }

// ============ MAIN COMPONENT ============
const LiveInteractions: React.FC<Props> = ({ matchId, team1, team2, team1Short, team2Short }) => {
  const [activePanel, setActivePanel] = useState<'reactions' | 'chat' | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [_userId, setUserId] = useState<string>('');
  const userIdRef = useRef<string>('');
  const [showSetup, setShowSetup] = useState(false);
  const [pendingAfter, setPendingAfter] = useState<PendingAction>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [throwTarget, setThrowTarget] = useState<ActiveUser | null>(null);

  const [flying, setFlying] = useState<{ id: string; e: string; dur: number; lane: number }[]>([]);
  const [activeThrows, setActiveThrows] = useState<{ id: string; t: ThrowEvent }[]>([]);
  const [flights, setFlights] = useState<FlightItem[]>([]);

  const userPositionsRef = useRef<Record<string, ChipBox>>({});
  const chipRefsMap = useRef<Record<string, View | null>>({});
  const team1ListRef = useRef<FlatList<ActiveUser> | null>(null);
  const team2ListRef = useRef<FlatList<ActiveUser> | null>(null);
  const feedScrollRef = useRef<ScrollView | null>(null);
  const lastActionRef = useRef<number>(0);
  const dedupeFeedIds = useRef<Set<string>>(new Set());

  // ============ Initial load: userId, profile (per-match), legacy migration ============
  useEffect(() => {
    if (!matchId) return;
    (async () => {
      try {
        const [rawProfPerMatch, rawId, rawLast, rawNameMem, rawLegacyProf] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY_FOR(matchId)),
          AsyncStorage.getItem(USER_ID_KEY),
          AsyncStorage.getItem(RATE_KEY),
          AsyncStorage.getItem(NAME_MEMORY_KEY),
          AsyncStorage.getItem(LEGACY_PROFILE_KEY),
        ]);
        let uid = rawId;
        if (!uid) {
          uid = genUserId();
          AsyncStorage.setItem(USER_ID_KEY, uid).catch(() => {});
        }
        userIdRef.current = uid;
        setUserId(uid);

        // Per-match profile (preferred)
        if (rawProfPerMatch) {
          const p = JSON.parse(rawProfPerMatch);
          if (p && p.name && (p.team === '1' || p.team === '2')) {
            setProfile({ name: p.name, team: p.team, country: p.country || '🏳️' });
          }
        }
        // Name memory (if no per-match profile, keep their name pre-filled)
        if (!rawProfPerMatch && rawNameMem) {
          // Do not set profile yet — team must be picked for THIS match
        } else if (!rawProfPerMatch && rawLegacyProf) {
          // Legacy v1 profile (name+country) — keep the name memorised
          try {
            const lp = JSON.parse(rawLegacyProf);
            if (lp?.name) AsyncStorage.setItem(NAME_MEMORY_KEY, lp.name).catch(() => {});
          } catch {}
        }
        if (rawLast) lastActionRef.current = parseInt(rawLast) || 0;
      } catch {}
    })();
  }, [matchId]);

  // ============ Predictive cricket pills (dynamic team flags + short names) ============
  const chatPills = useMemo<string[]>(() => {
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

  // ============ Flying-emoji listener (stream reactions, always-on) ============
  useEffect(() => {
    if (!matchId) return;
    const joined = Date.now();
    const unsub = subscribeStreamReactions(matchId, (r) => {
      if (r.t && r.t < joined - 8000) return;
      spawnFlying(r.e);
    });
    return () => { try { unsub(); } catch {} };
  }, [matchId]);

  // ============ Throws listener (always-on) — schedules flight + burst ============
  useEffect(() => {
    if (!matchId) return;
    const joined = Date.now();
    const unsub = subscribeThrows(matchId, (t) => {
      if (t.time && t.time < joined - 8000) return;

      // Dedupe: same id can fire twice in some bad-network cases
      const eventId = `throw_${t.id}`;
      if (dedupeFeedIds.current.has(eventId)) return;
      dedupeFeedIds.current.add(eventId);

      // Push to combined live feed
      setFeedEvents((cur) => {
        const next: FeedEvent[] = [...cur, {
          kind: 'throw' as const, id: eventId, time: t.time || Date.now(),
          from: t.from, to: t.to, fromTeam: t.fromTeam, toTeam: t.toTeam, action: t.action,
        }].slice(-MAX_FEED);
        return next;
      });
      setTimeout(() => { try { feedScrollRef.current?.scrollToEnd({ animated: true }); } catch {} }, 50);

      // ===== EMOJI FLIGHT (sender → receiver) =====
      const senderBox = userPositionsRef.current[t.fromId];
      const receiverBox = userPositionsRef.current[t.toId];
      const flightId = `flight_${t.id}_${Math.random().toString(36).slice(2, 6)}`;
      if (senderBox && receiverBox) {
        setFlights((cur) => [...cur, { id: flightId, from: senderBox, to: receiverBox, emoji: t.action }]);
        // After flight, schedule the burst at receiver
        setTimeout(() => {
          setFlights((cur) => cur.filter((f) => f.id !== flightId));
          scheduleBurst(t);
        }, EMOJI_FLIGHT_MS);
      } else if (receiverBox) {
        // Sender not in view (e.g. user scrolled away) — flight from edge
        const fromTeam = inferSenderTeam(t);
        const startX = fromTeam === '2' ? SCREEN_W + 40 : -40;
        const startY = receiverBox.y;
        setFlights((cur) => [...cur, {
          id: flightId,
          from: { x: startX, y: startY, w: 40, h: 40 },
          to: receiverBox,
          emoji: t.action,
        }]);
        setTimeout(() => {
          setFlights((cur) => cur.filter((f) => f.id !== flightId));
          scheduleBurst(t);
        }, EMOJI_FLIGHT_MS);
      } else {
        // No receiver position either — just burst at fallback center
        scheduleBurst(t);
      }
    });
    return () => { try { unsub(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  function inferSenderTeam(t: ThrowEvent): '1' | '2' | undefined {
    if (t.fromTeam) return t.fromTeam;
    // Try to infer from active users list
    const sender = activeUsers.find((u) => u.id === t.fromId);
    return sender?.team;
  }

  function scheduleBurst(t: ThrowEvent) {
    const id = `burst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setActiveThrows((cur) => [...cur, { id, t }]);
    setTimeout(() => setActiveThrows((cur) => cur.filter((x) => x.id !== id)), 1800);
  }

  // ============ Active users + presence ============
  useEffect(() => {
    if (activePanel !== 'chat' || !matchId) return;
    if (profile && userIdRef.current) {
      touchUser(matchId, userIdRef.current, profile.name, profile.country, profile.team);
    }
    const unsub = subscribeActiveUsers(matchId, (users) => setActiveUsers(users));
    const heartbeat = setInterval(() => {
      if (profile && userIdRef.current) {
        touchUser(matchId, userIdRef.current, profile.name, profile.country, profile.team);
      }
    }, HEARTBEAT_MS);
    return () => { try { unsub(); } catch {} ; clearInterval(heartbeat); };
  }, [activePanel, matchId, profile]);

  // ============ Chat messages — load cached, subscribe, persist, push to combined feed ============
  useEffect(() => {
    if (!matchId) return;
    (async () => {
      try {
        const [raw, rawFeed] = await Promise.all([
          AsyncStorage.getItem(MSG_CACHE_KEY + matchId),
          AsyncStorage.getItem(FEED_CACHE_KEY + matchId),
        ]);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) setMessages(arr.slice(-MAX_MSGS));
        }
        if (rawFeed) {
          const arr = JSON.parse(rawFeed);
          if (Array.isArray(arr) && arr.length) setFeedEvents(arr.slice(-MAX_FEED));
        }
      } catch {}
    })();
  }, [matchId]);

  useEffect(() => {
    if (!matchId || messages.length === 0) return;
    AsyncStorage.setItem(MSG_CACHE_KEY + matchId, JSON.stringify(messages.slice(-MAX_MSGS))).catch(() => {});
  }, [messages, matchId]);

  useEffect(() => {
    if (!matchId || feedEvents.length === 0) return;
    AsyncStorage.setItem(FEED_CACHE_KEY + matchId, JSON.stringify(feedEvents.slice(-MAX_FEED))).catch(() => {});
  }, [feedEvents, matchId]);

  useEffect(() => {
    if (activePanel !== 'chat' || !matchId) return;
    const unsub = subscribeMessages(matchId, (m) => {
      setMessages((prev) => {
        const isMine = profile && m.name === profile.name && m.country === profile.country;
        let filtered = prev;
        if (isMine) {
          filtered = prev.filter((p) =>
            !(p.id.startsWith('local_') && p.name === m.name && p.country === m.country && p.msg === m.msg)
          );
        }
        if (filtered.some((p) => p.id === m.id)) return filtered;
        return [...filtered, m].slice(-MAX_MSGS);
      });
      // Push to combined feed (dedupe by id)
      setFeedEvents((cur) => {
        const fid = `msg_${m.id}`;
        if (dedupeFeedIds.current.has(fid)) return cur;
        dedupeFeedIds.current.add(fid);
        return [...cur, {
          kind: 'msg' as const, id: fid, time: m.time, name: m.name, country: m.country,
          team: (m as any).team as '1' | '2' | undefined, msg: m.msg,
        }].slice(-MAX_FEED);
      });
      setTimeout(() => { try { feedScrollRef.current?.scrollToEnd({ animated: true }); } catch {} }, 50);
    });
    return () => { try { unsub(); } catch {} };
  }, [activePanel, matchId, profile]);

  // ============ Auto-scroll team lists to top when their top user changes ============
  const team1Users = useMemo(() => activeUsers.filter((u) => u.team === '1'), [activeUsers]);
  const team2Users = useMemo(() => activeUsers.filter((u) => u.team === '2'), [activeUsers]);
  const prevTop1 = useRef<string>('');
  const prevTop2 = useRef<string>('');
  useEffect(() => {
    const top1 = team1Users[0]?.id || '';
    if (top1 && top1 !== prevTop1.current) {
      prevTop1.current = top1;
      try { team1ListRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch {}
    }
    const top2 = team2Users[0]?.id || '';
    if (top2 && top2 !== prevTop2.current) {
      prevTop2.current = top2;
      try { team2ListRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch {}
    }
  }, [team1Users, team2Users]);

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

  function saveProfile(name: string, team: '1' | '2') {
    const cleaned = name.replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 12).trim();
    if (!cleaned) return;
    // country derived from team flag for backward compat & sender-name display
    const teamFlag = teamNameToFlag(team === '1' ? (team1 || team1Short) : (team2 || team2Short));
    const p: Profile = { name: cleaned, team, country: teamFlag };
    setProfile(p);
    AsyncStorage.setItem(PROFILE_KEY_FOR(matchId), JSON.stringify(p)).catch(() => {});
    AsyncStorage.setItem(NAME_MEMORY_KEY, cleaned).catch(() => {});
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
            from: `${p.country} ${p.name}`, fromId: uid, fromTeam: p.team,
            to: `${pendingAfter.target.country} ${pendingAfter.target.name}`, toId: pendingAfter.target.id, toTeam: pendingAfter.target.team,
            action: pendingAfter.action,
          });
          markRate();
        }
      }
    }
    setPendingAfter(null);
  }

  function pushLocalAndSend(p: Profile, uid: string, msg: string) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const localMsg: ChatMessage = {
      id: localId, name: p.name, country: p.country, msg, time: Date.now(),
    };
    setMessages((prev) => [...prev, localMsg].slice(-MAX_MSGS));
    setFeedEvents((cur) => [...cur, {
      kind: 'msg' as const, id: `msg_${localId}`, time: localMsg.time, name: p.name, country: p.country, team: p.team, msg,
    }].slice(-MAX_FEED));
    setTimeout(() => { try { feedScrollRef.current?.scrollToEnd({ animated: true }); } catch {} }, 30);
    sendMessage(matchId, { name: p.name, country: p.country, msg, userId: uid, team: p.team });
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
    // Optimistic flight: animate from self capsule → target capsule immediately
    const senderBox = userPositionsRef.current[uid];
    const receiverBox = userPositionsRef.current[target.id];
    if (senderBox && receiverBox) {
      const flightId = `flight_optim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setFlights((cur) => [...cur, { id: flightId, from: senderBox, to: receiverBox, emoji: action }]);
      setTimeout(() => setFlights((cur) => cur.filter((f) => f.id !== flightId)), EMOJI_FLIGHT_MS);
    }
    sendThrow(matchId, {
      from: `${profile.country} ${profile.name}`, fromId: uid, fromTeam: profile.team,
      to: `${target.country} ${target.name}`, toId: target.id, toTeam: target.team,
      action,
    });
    markRate();
    setThrowTarget(null);
  }

  function captureChipPosition(userId: string) {
    const refEl: any = chipRefsMap.current[userId];
    if (refEl?.measureInWindow) {
      refEl.measureInWindow((x: number, y: number, w: number, h: number) => {
        userPositionsRef.current[userId] = { x, y, w, h };
      });
    }
  }

  // ============ Build display lists (include SELF for instant feedback) ============
  const team1WithSelf = useMemo(() => {
    if (profile?.team !== '1' || !userIdRef.current) return team1Users;
    if (team1Users.some((u) => u.id === userIdRef.current)) return team1Users;
    return [{ id: userIdRef.current, name: profile.name, country: profile.country, lastActionTime: Date.now(), team: '1' as const }, ...team1Users];
  }, [team1Users, profile]);
  const team2WithSelf = useMemo(() => {
    if (profile?.team !== '2' || !userIdRef.current) return team2Users;
    if (team2Users.some((u) => u.id === userIdRef.current)) return team2Users;
    return [{ id: userIdRef.current, name: profile.name, country: profile.country, lastActionTime: Date.now(), team: '2' as const }, ...team2Users];
  }, [team2Users, profile]);

  const t1Short = shortenTeamName(team1, team1Short);
  const t2Short = shortenTeamName(team2, team2Short);

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

      {/* Chat Room — split-team layout */}
      {activePanel === 'chat' && (
        <View style={styles.chatDock} data-testid="chat-panel">
          {/* ── Team headers ── */}
          <View style={styles.teamHeadersRow}>
            <View style={[styles.teamHeaderChip, { backgroundColor: TEAM1_COLOR }]}>
              <Text style={styles.teamHeaderTxt}>{teamNameToFlag(team1 || team1Short)} {t1Short}</Text>
              <Text style={styles.teamHeaderSub}>{team1WithSelf.length} online</Text>
            </View>
            <View style={styles.vsBadge}><Text style={styles.vsTxt}>VS</Text></View>
            <View style={[styles.teamHeaderChip, { backgroundColor: TEAM2_COLOR }]}>
              <Text style={styles.teamHeaderTxt}>{teamNameToFlag(team2 || team2Short)} {t2Short}</Text>
              <Text style={styles.teamHeaderSub}>{team2WithSelf.length} online</Text>
            </View>
          </View>

          {/* ── Two-column user lists ── */}
          <View style={styles.usersSplit}>
            <View style={styles.teamCol}>
              <FlatList
                ref={team1ListRef}
                data={team1WithSelf}
                keyExtractor={(u) => u.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.teamColContent}
                renderItem={({ item, index }) => (
                  <UserCapsule
                    user={item}
                    teamShort={t1Short}
                    teamColor={TEAM1_COLOR}
                    teamDark={TEAM1_DARK}
                    isSelf={item.id === userIdRef.current}
                    isTop={index === 0}
                    onPress={() => {
                      if (item.id === userIdRef.current) return;
                      captureChipPosition(item.id);
                      setThrowTarget(item);
                    }}
                    onMount={(view) => { chipRefsMap.current[item.id] = view; captureChipPosition(item.id); }}
                  />
                )}
                ListEmptyComponent={<Text style={styles.colEmpty}>No supporters yet</Text>}
              />
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.teamCol}>
              <FlatList
                ref={team2ListRef}
                data={team2WithSelf}
                keyExtractor={(u) => u.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.teamColContent}
                renderItem={({ item, index }) => (
                  <UserCapsule
                    user={item}
                    teamShort={t2Short}
                    teamColor={TEAM2_COLOR}
                    teamDark={TEAM2_DARK}
                    isSelf={item.id === userIdRef.current}
                    isTop={index === 0}
                    onPress={() => {
                      if (item.id === userIdRef.current) return;
                      captureChipPosition(item.id);
                      setThrowTarget(item);
                    }}
                    onMount={(view) => { chipRefsMap.current[item.id] = view; captureChipPosition(item.id); }}
                  />
                )}
                ListEmptyComponent={<Text style={styles.colEmpty}>No supporters yet</Text>}
              />
            </View>
          </View>

          {/* ── Center live feed ── */}
          <View style={styles.feedWrap}>
            <Text style={styles.feedTitle}>💬 Live Feed</Text>
            <ScrollView
              ref={feedScrollRef}
              style={styles.feedScroll}
              contentContainerStyle={styles.feedScrollContent}
              onContentSizeChange={() => { try { feedScrollRef.current?.scrollToEnd({ animated: false }); } catch {} }}
              showsVerticalScrollIndicator={false}
            >
              {feedEvents.length === 0 ? (
                <Text style={styles.feedEmpty}>Tap a user → throw emoji • Tap a pill → send message</Text>
              ) : (
                feedEvents.map((e) => (
                  <FeedRow key={e.id} event={e} t1Color={TEAM1_COLOR} t2Color={TEAM2_COLOR} />
                ))
              )}
            </ScrollView>
          </View>

          {/* ── Predictive pills ── */}
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
        <SetupForm
          onCancel={() => { setShowSetup(false); setPendingAfter(null); }}
          onSave={saveProfile}
          team1Label={team1 || team1Short || 'Team 1'}
          team2Label={team2 || team2Short || 'Team 2'}
          team1Short={t1Short}
          team2Short={t2Short}
        />
      </Modal>

      {/* Throw Picker */}
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
            <Text style={styles.throwHint}>Jumps to #1 in their team column when hit 🎯</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Flying stream reactions overlay */}
      <View style={styles.flyOverlay} pointerEvents="none">
        {flying.map((f) => (
          <FlyingLabel key={f.id} label={f.e} duration={f.dur} lane={f.lane} />
        ))}
      </View>

      {/* Live emoji flights (sender → receiver) */}
      <View style={styles.flightOverlay} pointerEvents="none">
        {flights.map((fl) => (
          <EmojiFlight key={fl.id} from={fl.from} to={fl.to} emoji={fl.emoji} />
        ))}
      </View>

      {/* Throw bursts on receiver */}
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

// ─── USER CAPSULE ───────────────────────────────────────────────
interface UserCapsuleProps {
  user: ActiveUser;
  teamShort: string;
  teamColor: string;
  teamDark: string;
  isSelf: boolean;
  isTop: boolean;
  onPress: () => void;
  onMount: (view: View | null) => void;
}
const UserCapsule: React.FC<UserCapsuleProps> = ({ user, teamShort, teamColor, teamDark, isSelf, isTop, onPress, onMount }) => {
  // gentle pulse when promoted to top spot
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isTop) return;
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [isTop, user.id]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        ref={onMount as any}
        onPress={onPress}
        activeOpacity={isSelf ? 1 : 0.7}
        onLayout={() => onMount(null /* re-measure trigger */)}
        style={[
          styles.capsule,
          { borderColor: isTop ? '#FFD54F' : teamDark, borderWidth: isTop ? 2 : 1, backgroundColor: teamDark + 'AA' },
          isSelf && styles.capsuleSelf,
        ]}
      >
        {isTop && <View style={styles.topBadge}><Text style={styles.topBadgeTxt}>🔥</Text></View>}
        <View style={[styles.capsuleAvatar, { backgroundColor: teamColor }]}>
          <Text style={styles.capsuleTeamTxt} numberOfLines={1}>{teamShort}</Text>
        </View>
        <Text style={styles.capsuleName} numberOfLines={1}>{user.name}</Text>
        {isSelf && <Text style={styles.capsuleSelfBadge}>YOU</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── FEED ROW (chat msg or throw event) ──────────────────────────
const FeedRow: React.FC<{ event: FeedEvent; t1Color: string; t2Color: string }> = ({ event, t1Color, t2Color }) => {
  if (event.kind === 'throw') {
    const fromColor = event.fromTeam === '1' ? t1Color : event.fromTeam === '2' ? t2Color : NEUTRAL_COLOR;
    const toColor = event.toTeam === '1' ? t1Color : event.toTeam === '2' ? t2Color : NEUTRAL_COLOR;
    return (
      <View style={styles.feedRow}>
        <Text style={styles.feedEmojiBig}>{event.action}</Text>
        <Text style={[styles.feedActor, { color: fromColor }]} numberOfLines={1}>{event.from}</Text>
        <Text style={styles.feedArrow}>→</Text>
        <Text style={[styles.feedActor, { color: toColor }]} numberOfLines={1}>{event.to}</Text>
      </View>
    );
  }
  const color = event.team === '1' ? t1Color : event.team === '2' ? t2Color : '#1B5E20';
  return (
    <View style={styles.feedRowMsg}>
      <Text style={[styles.feedMsgHeader, { color }]} numberOfLines={1}>{event.country} {event.name}</Text>
      <Text style={styles.feedMsgTxt} numberOfLines={2}>{event.msg}</Text>
    </View>
  );
};

// ─── EMOJI FLIGHT (sender → receiver visible arc) ────────────────
const EmojiFlight: React.FC<{ from: ChipBox; to: ChipBox; emoji: string }> = ({ from, to, emoji }) => {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: EMOJI_FLIGHT_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // Start centre of sender's capsule
  const startX = from.x + from.w / 2;
  const startY = from.y + from.h / 2;
  const endX = to.x + to.w / 2;
  const endY = to.y + to.h / 2;
  const arcHeight = -(60 + Math.abs(endX - startX) * 0.25);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] });
  // Parabolic arc: peak at progress=0.5
  const translateY = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [startY, (startY + endY) / 2 + arcHeight, endY],
  });
  const scale = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.4, 1.6] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0.4] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -16, top: -16,
        width: 32, height: 32,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateX }, { translateY }, { scale }, { rotate }],
        opacity,
      }}
    >
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
    </Animated.View>
  );
};

// ─── SETUP FORM (team selection per match) ───────────────────────
interface SetupFormProps {
  onCancel: () => void;
  onSave: (name: string, team: '1' | '2') => void;
  team1Label: string;
  team2Label: string;
  team1Short: string;
  team2Short: string;
}
const SetupForm: React.FC<SetupFormProps> = ({ onCancel, onSave, team1Label, team2Label, team1Short, team2Short }) => {
  const [name, setName] = useState('');
  const [team, setTeam] = useState<'1' | '2' | null>(null);

  // Prefill name from memory
  useEffect(() => {
    AsyncStorage.getItem(NAME_MEMORY_KEY).then((n) => { if (n) setName(n); }).catch(() => {});
  }, []);

  const canSave = !!name.trim() && (team === '1' || team === '2');

  return (
    <View style={styles.modalBg}>
      <View style={styles.setupBox}>
        <Text style={styles.setupTitle}>Join the chat</Text>
        <Text style={styles.setupHint}>Pick your name (max 12, letters/numbers only)</Text>
        <TextInput
          value={name}
          onChangeText={(t) => setName(t.replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 12))}
          placeholder="Your name"
          placeholderTextColor="#999"
          maxLength={12}
          style={styles.nameInput}
        />
        <Text style={[styles.setupHint, { marginTop: 14 }]}>Which team are you supporting?</Text>
        <View style={styles.teamPickWrap}>
          <TouchableOpacity
            onPress={() => setTeam('1')}
            activeOpacity={0.8}
            style={[
              styles.teamPickBtn,
              { backgroundColor: TEAM1_COLOR },
              team === '1' && styles.teamPickActive,
            ]}
          >
            <View style={styles.teamPickAvatar}>
              <Text style={styles.teamPickAvatarTxt}>{team1Short}</Text>
            </View>
            <Text style={styles.teamPickName} numberOfLines={2}>{team1Label}</Text>
            {team === '1' && <Ionicons name="checkmark-circle" size={20} color="#FFF" style={styles.teamPickCheck} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTeam('2')}
            activeOpacity={0.8}
            style={[
              styles.teamPickBtn,
              { backgroundColor: TEAM2_COLOR },
              team === '2' && styles.teamPickActive,
            ]}
          >
            <View style={styles.teamPickAvatar}>
              <Text style={styles.teamPickAvatarTxt}>{team2Short}</Text>
            </View>
            <Text style={styles.teamPickName} numberOfLines={2}>{team2Label}</Text>
            {team === '2' && <Ionicons name="checkmark-circle" size={20} color="#FFF" style={styles.teamPickCheck} />}
          </TouchableOpacity>
        </View>
        <Text style={styles.setupNote}>You'll join the {team === '1' ? team1Label : team === '2' ? team2Label : '...'} fan column. Team choice can be re-picked next match.</Text>
        <View style={styles.setupActions}>
          <TouchableOpacity onPress={onCancel} style={[styles.setupBtn, styles.setupBtnGhost]}>
            <Text style={[styles.setupBtnTxt, { color: '#999' }]}>Later</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => canSave && onSave(name, team!)}
            disabled={!canSave}
            style={[styles.setupBtn, !canSave && { opacity: 0.5 }]}
          >
            <Text style={styles.setupBtnTxt}>Save & Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ─── Flying stream reaction (bottom→top global) ──────────────────
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

// ─── ThrowBurst — Lottie / EmojiBurst on the target capsule ─────
const ThrowBurst: React.FC<{
  action: string;
  position?: ChipBox;
  fallbackLabel: string;
}> = ({ action, position, fallbackLabel }) => {
  const lottieItem = THROW_ITEMS.find((t) => t.key === action && !!t.lottie);
  const hasPos = !!position;
  const splashSize = hasPos ? 130 : Math.min(SCREEN_W * 0.65, 260);
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

  chatDock: { position: 'absolute', left: 8, right: 8, bottom: 80, height: 520, backgroundColor: 'rgba(8, 18, 12, 0.94)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', padding: 10, zIndex: 9998, elevation: 20 },

  // ── Team headers ──
  teamHeadersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  teamHeaderChip: { flex: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center' },
  teamHeaderTxt: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  teamHeaderSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 1 },
  vsBadge: { paddingHorizontal: 8 },
  vsTxt: { color: '#FFD54F', fontWeight: '900', fontSize: 12 },

  // ── Split user columns ──
  usersSplit: { flexDirection: 'row', height: 192, marginBottom: 6 },
  teamCol: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 4 },
  teamColContent: { paddingVertical: 6, gap: 6 },
  splitDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 5 },
  colEmpty: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },

  // ── User Capsule ──
  capsule: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  capsuleSelf: { borderColor: '#4CAF50', borderWidth: 2 },
  capsuleAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
  },
  capsuleTeamTxt: { color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  capsuleName: { color: '#FFF', fontWeight: '700', fontSize: 11, maxWidth: 70, textAlign: 'center' },
  capsuleSelfBadge: { color: '#A5D6A7', fontSize: 8, fontWeight: '900', marginTop: 1 },
  topBadge: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFD54F', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  topBadgeTxt: { fontSize: 10 },

  // ── Center feed ──
  feedWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4, marginBottom: 6 },
  feedTitle: { color: '#FFD54F', fontWeight: '900', fontSize: 11, marginBottom: 2, paddingHorizontal: 2 },
  feedScroll: { flex: 1 },
  feedScrollContent: { paddingVertical: 2 },
  feedEmpty: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontStyle: 'italic', textAlign: 'center', padding: 12 },
  feedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: 4, gap: 6 },
  feedRowMsg: { paddingVertical: 4, paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, marginBottom: 3 },
  feedEmojiBig: { fontSize: 18 },
  feedActor: { fontWeight: '800', fontSize: 11, flexShrink: 1, maxWidth: 110 },
  feedArrow: { color: '#FFD54F', fontWeight: '900', fontSize: 13 },
  feedMsgHeader: { fontWeight: '900', fontSize: 11, marginBottom: 1 },
  feedMsgTxt: { color: '#FFF', fontSize: 12, fontWeight: '500' },

  // ── Pills row ──
  chatPillsWrap: { maxHeight: 44 },
  pillsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8, paddingRight: 12 },
  pill: { backgroundColor: 'rgba(76,175,80,0.95)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 6, elevation: 4 },
  pillFlag: { backgroundColor: 'rgba(255,193,7,0.9)' },
  pillFlagTxt: { fontSize: 18 },
  chatPill: { backgroundColor: 'rgba(33, 150, 243, 0.95)' },
  pillTxt: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  // ── Setup modal ──
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  setupBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, width: '100%', maxWidth: 380 },
  setupTitle: { fontSize: 18, fontWeight: '900', color: '#1B5E20', marginBottom: 8 },
  setupHint: { color: '#555', fontSize: 12, marginBottom: 6 },
  setupNote: { color: '#888', fontSize: 11, fontStyle: 'italic', marginTop: 8 },
  nameInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 15, color: '#212121' },
  teamPickWrap: { flexDirection: 'row', gap: 10, marginTop: 6 },
  teamPickBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 110,
  },
  teamPickActive: { borderColor: '#FFD54F' },
  teamPickAvatar: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  teamPickAvatarTxt: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  teamPickName: { color: '#FFF', fontWeight: '800', fontSize: 12, textAlign: 'center' },
  teamPickCheck: { position: 'absolute', top: 6, right: 6 },
  setupActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  setupBtn: { backgroundColor: '#1B5E20', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  setupBtnGhost: { backgroundColor: 'transparent' },
  setupBtnTxt: { color: '#FFF', fontWeight: '800' },

  // ── Throw modal ──
  throwBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, width: '92%', maxWidth: 380 },
  throwTitle: { fontSize: 15, fontWeight: '900', color: '#212121', marginBottom: 12, textAlign: 'center' },
  throwGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 8, marginBottom: 12 },
  throwItem: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1, borderColor: '#FFCC80', width: '22%', minWidth: 70 },
  throwEmoji: { fontSize: 28 },
  throwLabel: { fontSize: 10, fontWeight: '700', color: '#E65100', marginTop: 2 },
  throwHint: { color: '#999', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },

  // ── Overlays ──
  flyOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, elevation: 2 },
  flyItem: { position: 'absolute', bottom: 100 },
  flyBubble: { backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', elevation: 3 },
  flyText: { fontSize: 18, fontWeight: '900', color: '#212121' },

  flightOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 70, elevation: 4 },

  throwOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, elevation: 3 },
  burstWrap: { position: 'absolute' },
  burstLabel: { position: 'absolute', alignSelf: 'center', left: 0, right: 0, alignItems: 'center' },
  burstLabelTxt: { backgroundColor: 'rgba(0,0,0,0.78)', color: '#FFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 18, fontSize: 12, fontWeight: '800' },
});

export default LiveInteractions;
