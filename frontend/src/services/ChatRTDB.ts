/**
 * ChatRTDB — Live Reactions + Chat Room + Active-Users Presence
 *
 * IMPORTANT: This module initialises Firebase under a DEDICATED NAMED app
 * (`cricapp-rtdb`) so it never collides with the default app that
 * `FirebaseKeyService.ts` may have already created (without a `databaseURL`).
 * That earlier collision caused `getDatabase(app, url)` to silently bind to
 * the wrong endpoint and made every `push()` look like a no-op — the symptom
 * being "chat messages never appear" reported in v1.0.17 rev-7 testing.
 *
 * RTDB tree:
 *   /chat/{matchId}/messages       - chat messages         { name, country, msg, time }
 *   /chat/{matchId}/streams        - flying reactions      { e, t }
 *   /chat/{matchId}/throws         - targeted Lottie hits  { from, fromId, to, toId, action, time }
 *   /chat/{matchId}/users/{userId} - presence              { name, country, lastActionTime }
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  query,
  limitToLast,
  orderByChild,
  onChildAdded,
  onValue,
  serverTimestamp,
  off,
  Database,
  DataSnapshot,
} from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBCYnmcQBAF6b-cJEiy_npjbHp38jUUX7s',
  projectId: 'cricapp-2092',
  storageBucket: 'cricapp-2092.firebasestorage.app',
  messagingSenderId: '31510956391',
  appId: '1:31510956391:android:f716580ab8638ce52b87c2',
  databaseURL: 'https://cricapp-2092-default-rtdb.firebaseio.com',
};

const RTDB_APP_NAME = 'cricapp-rtdb';

let rtdbApp: FirebaseApp | null = null;
let dbRef: Database | null = null;

try {
  const existing = getApps().find((a) => a.name === RTDB_APP_NAME);
  rtdbApp = existing || initializeApp(FIREBASE_CONFIG, RTDB_APP_NAME);
  console.log('[ChatRTDB] named app initialized', RTDB_APP_NAME);
} catch (e) {
  console.log('[ChatRTDB] initializeApp failed', e);
}

function getDB(): Database | null {
  if (dbRef) return dbRef;
  if (!rtdbApp) return null;
  try {
    dbRef = getDatabase(rtdbApp);
    console.log('[ChatRTDB] database bound', FIREBASE_CONFIG.databaseURL);
    return dbRef;
  } catch (e) {
    console.log('[ChatRTDB] getDatabase failed', e);
    return null;
  }
}

// ============ TYPES ============
export interface ChatMessage { id: string; name: string; country: string; team?: '1' | '2'; msg: string; time: number }
export interface StreamReaction { id: string; e: string; t: number }
export interface ThrowEvent {
  id: string; from: string; fromId: string; to: string; toId: string; action: string; time: number;
  fromTeam?: '1' | '2'; toTeam?: '1' | '2';
}
export interface ActiveUser {
  id: string; name: string; country: string; lastActionTime: number;
  team?: '1' | '2';
  /** Set when user RECEIVES an emoji \u2014 used to boost recipient to the top of the live list. */
  lastEmojiAt?: number;
}

// ============ CHAT MESSAGES ============
export function sendMessage(
  matchId: string,
  payload: { name: string; country: string; msg: string; userId: string; team?: '1' | '2' },
): void {
  const db = getDB();
  if (!db || !matchId) { console.log('[ChatRTDB] sendMessage: no db / no matchId'); return; }
  try {
    const r = ref(db, `chat/${matchId}/messages`);
    const newRef = push(r, {
      name: payload.name, country: payload.country, msg: payload.msg, time: serverTimestamp(),
      ...(payload.team ? { team: payload.team } : {}),
    });
    console.log('[ChatRTDB] sendMessage push OK', newRef.key);
    touchUser(matchId, payload.userId, payload.name, payload.country, payload.team);
  } catch (e) {
    console.log('[ChatRTDB] sendMessage error', e);
  }
}

export function subscribeMessages(matchId: string, onMessage: (m: ChatMessage) => void): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/messages`), limitToLast(15));
    const handler = (snap: DataSnapshot) => {
      const v = snap.val();
      if (!v) return;
      onMessage({
        id: snap.key || String(Date.now()),
        name: String(v.name || 'Anon'),
        country: String(v.country || '🌍'),
        msg: String(v.msg || ''),
        time: typeof v.time === 'number' ? v.time : Date.now(),
      });
    };
    onChildAdded(q, handler);
    return () => { try { off(q, 'child_added', handler); } catch {} };
  } catch (e) { console.log('[ChatRTDB] subscribeMessages error', e); return () => {}; }
}

// ============ FLYING REACTIONS ============
export function sendStreamReaction(matchId: string, label: string): void {
  const db = getDB();
  if (!db || !matchId) return;
  try { push(ref(db, `chat/${matchId}/streams`), { e: label, t: serverTimestamp() }); }
  catch (e) { console.log('[ChatRTDB] sendStream error', e); }
}

export function subscribeStreamReactions(matchId: string, cb: (r: StreamReaction) => void): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/streams`), limitToLast(20));
    const handler = (snap: DataSnapshot) => {
      const v = snap.val();
      if (!v) return;
      cb({ id: snap.key || String(Date.now()), e: String(v.e || '👏'), t: typeof v.t === 'number' ? v.t : Date.now() });
    };
    onChildAdded(q, handler);
    return () => { try { off(q, 'child_added', handler); } catch {} };
  } catch (e) { console.log('[ChatRTDB] subscribeStream error', e); return () => {}; }
}

// ============ TARGETED THROWS ============
export function sendThrow(
  matchId: string,
  payload: { from: string; fromId: string; to: string; toId: string; action: string; fromTeam?: '1' | '2'; toTeam?: '1' | '2' },
): void {
  const db = getDB();
  if (!db || !matchId) return;
  try {
    push(ref(db, `chat/${matchId}/throws`), {
      from: payload.from, fromId: payload.fromId,
      to: payload.to, toId: payload.toId,
      action: payload.action,
      time: serverTimestamp(),
      ...(payload.fromTeam ? { fromTeam: payload.fromTeam } : {}),
      ...(payload.toTeam ? { toTeam: payload.toTeam } : {}),
    });
    if (payload.toId) {
      // Bump receiver's lastEmojiAt so UI can boost them to the top
      update(ref(db, `chat/${matchId}/users/${payload.toId}`), {
        lastActionTime: serverTimestamp(),
        lastEmojiAt: serverTimestamp(),
      });
    }
    console.log('[ChatRTDB] sendThrow OK', payload.action, '->', payload.to);
  } catch (e) { console.log('[ChatRTDB] sendThrow error', e); }
}

export function subscribeThrows(matchId: string, cb: (t: ThrowEvent) => void): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/throws`), limitToLast(10));
    const handler = (snap: DataSnapshot) => {
      const v = snap.val();
      if (!v) return;
      cb({
        id: snap.key || String(Date.now()),
        from: String(v.from || ''), fromId: String(v.fromId || ''),
        to: String(v.to || ''), toId: String(v.toId || ''),
        action: String(v.action || ''),
        time: typeof v.time === 'number' ? v.time : Date.now(),
        fromTeam: v.fromTeam === '1' || v.fromTeam === '2' ? v.fromTeam : undefined,
        toTeam: v.toTeam === '1' || v.toTeam === '2' ? v.toTeam : undefined,
      });
    };
    onChildAdded(q, handler);
    return () => { try { off(q, 'child_added', handler); } catch {} };
  } catch (e) { console.log('[ChatRTDB] subscribeThrows error', e); return () => {}; }
}

// ============ ACTIVE-USERS PRESENCE ============
export function touchUser(matchId: string, userId: string, name: string, country: string, team?: '1' | '2'): void {
  const db = getDB();
  if (!db || !matchId || !userId) return;
  try {
    set(ref(db, `chat/${matchId}/users/${userId}`), {
      name, country, lastActionTime: serverTimestamp(),
      ...(team ? { team } : {}),
    });
    console.log('[ChatRTDB] touchUser OK', userId, name, team || '-');
  } catch (e) { console.log('[ChatRTDB] touchUser error', e); }
}

/**
 * Active-users list \u2014 sorted descending by max(lastEmojiAt, lastActionTime),
 * so the user who most recently RECEIVED an emoji (or sent any action) floats
 * to index 0. limitToLast(40) so both team columns have headroom.
 */
export function subscribeActiveUsers(matchId: string, cb: (users: ActiveUser[]) => void): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/users`), orderByChild('lastActionTime'), limitToLast(40));
    const handler = (snap: DataSnapshot) => {
      const v = snap.val() || {};
      const arr: ActiveUser[] = Object.entries(v).map(([id, raw]: [string, any]) => ({
        id,
        name: String(raw?.name || 'Anon'),
        country: String(raw?.country || '\ud83c\udf0d'),
        lastActionTime: typeof raw?.lastActionTime === 'number' ? raw.lastActionTime : 0,
        team: raw?.team === '1' || raw?.team === '2' ? raw.team : undefined,
        lastEmojiAt: typeof raw?.lastEmojiAt === 'number' ? raw.lastEmojiAt : 0,
      }));
      arr.sort((a, b) => {
        const aw = Math.max(a.lastEmojiAt || 0, a.lastActionTime || 0);
        const bw = Math.max(b.lastEmojiAt || 0, b.lastActionTime || 0);
        return bw - aw;
      });
      cb(arr);
    };
    onValue(q, handler);
    return () => { try { off(q, 'value', handler); } catch {} };
  } catch (e) { console.log('[ChatRTDB] subscribeActiveUsers error', e); return () => {}; }
}
