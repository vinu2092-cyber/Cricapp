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
export interface ChatMessage { id: string; name: string; country: string; msg: string; time: number }
export interface StreamReaction { id: string; e: string; t: number }
export interface ThrowEvent {
  id: string; from: string; fromId: string; to: string; toId: string; action: string; time: number;
}
export interface ActiveUser { id: string; name: string; country: string; lastActionTime: number }

// ============ CHAT MESSAGES ============
export function sendMessage(
  matchId: string,
  payload: { name: string; country: string; msg: string; userId: string },
): void {
  const db = getDB();
  if (!db || !matchId) { console.log('[ChatRTDB] sendMessage: no db / no matchId'); return; }
  try {
    const r = ref(db, `chat/${matchId}/messages`);
    const newRef = push(r, {
      name: payload.name, country: payload.country, msg: payload.msg, time: serverTimestamp(),
    });
    console.log('[ChatRTDB] sendMessage push OK', newRef.key);
    touchUser(matchId, payload.userId, payload.name, payload.country);
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
  payload: { from: string; fromId: string; to: string; toId: string; action: string },
): void {
  const db = getDB();
  if (!db || !matchId) return;
  try {
    push(ref(db, `chat/${matchId}/throws`), { ...payload, time: serverTimestamp() });
    if (payload.toId) {
      update(ref(db, `chat/${matchId}/users/${payload.toId}`), { lastActionTime: serverTimestamp() });
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
      });
    };
    onChildAdded(q, handler);
    return () => { try { off(q, 'child_added', handler); } catch {} };
  } catch (e) { console.log('[ChatRTDB] subscribeThrows error', e); return () => {}; }
}

// ============ ACTIVE-USERS PRESENCE ============
export function touchUser(matchId: string, userId: string, name: string, country: string): void {
  const db = getDB();
  if (!db || !matchId || !userId) return;
  try {
    set(ref(db, `chat/${matchId}/users/${userId}`), { name, country, lastActionTime: serverTimestamp() });
    console.log('[ChatRTDB] touchUser OK', userId, name);
  } catch (e) { console.log('[ChatRTDB] touchUser error', e); }
}

/**
 * Active-users list — sorted descending by lastActionTime so the most recent
 * actor is always at index 0 (the "hit jumps to #1" guarantee). Spec asks for
 * `.limitToLast(20)` to keep Spark-plan bandwidth tight.
 */
export function subscribeActiveUsers(matchId: string, cb: (users: ActiveUser[]) => void): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/users`), orderByChild('lastActionTime'), limitToLast(20));
    const handler = (snap: DataSnapshot) => {
      const v = snap.val() || {};
      const arr: ActiveUser[] = Object.entries(v).map(([id, raw]: [string, any]) => ({
        id,
        name: String(raw?.name || 'Anon'),
        country: String(raw?.country || '🌍'),
        lastActionTime: typeof raw?.lastActionTime === 'number' ? raw.lastActionTime : 0,
      }));
      arr.sort((a, b) => b.lastActionTime - a.lastActionTime);
      cb(arr);
    };
    onValue(q, handler);
    return () => { try { off(q, 'value', handler); } catch {} };
  } catch (e) { console.log('[ChatRTDB] subscribeActiveUsers error', e); return () => {}; }
}
