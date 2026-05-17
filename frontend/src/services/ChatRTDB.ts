/**
 * ChatRTDB — Live Shoutbox backed by Firebase Realtime Database (Spark-plan safe).
 *
 * STRICT RULES (per v1.0.17 brief):
 *  - ONLY Firebase Realtime Database. NEVER Firestore for chat.
 *  - Per-match isolated rooms at `/chat/{matchId}/messages`.
 *  - Targeted reactions at `/chat/{matchId}/reactions`.
 *  - All listeners use `limitToLast(10)` to cap bandwidth.
 *  - Tiny payload schema (no profile pics, no extra fields):
 *      messages: { name, country, msg, time }
 *      reactions: { from, to, action, time }
 *  - No user profiles in Firebase — name/country saved locally via AsyncStorage.
 */
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  push,
  query,
  limitToLast,
  onChildAdded,
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
  // US region (default) — Spark plan. RTDB MUST be enabled in console.
  databaseURL: 'https://cricapp-2092-default-rtdb.firebaseio.com',
};

let dbRef: Database | null = null;

function getDB(): Database | null {
  if (dbRef) return dbRef;
  try {
    const app: FirebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    dbRef = getDatabase(app, FIREBASE_CONFIG.databaseURL);
    return dbRef;
  } catch (e) {
    console.log('[ChatRTDB] init failed', e);
    return null;
  }
}

// ============ TYPES ============
export interface ChatMessage {
  id: string;
  name: string;
  country: string; // emoji flag e.g. "🇮🇳"
  msg: string;
  time: number;
}

export interface ReactionEvent {
  id: string;
  from: string; // sender display (e.g. "🇮🇳 Vinod")
  to: string; // target display (e.g. "🇱🇰 Rahul")
  action: string; // emoji or special key: "🍅" | "🥚" | "🌹" | any emoji
  time: number;
}

// ============ MESSAGES ============

export function sendMessage(matchId: string, payload: { name: string; country: string; msg: string }): void {
  const db = getDB();
  if (!db || !matchId) return;
  try {
    const r = ref(db, `chat/${matchId}/messages`);
    push(r, { ...payload, time: serverTimestamp() });
  } catch (e) {
    console.log('[ChatRTDB] sendMessage error', e);
  }
}

export function subscribeMessages(
  matchId: string,
  onMessage: (m: ChatMessage) => void,
): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/messages`), limitToLast(10));
    const handler = (snap: DataSnapshot) => {
      const val = snap.val();
      if (!val) return;
      onMessage({
        id: snap.key || String(Date.now()),
        name: String(val.name || 'Anon'),
        country: String(val.country || '🌍'),
        msg: String(val.msg || ''),
        time: typeof val.time === 'number' ? val.time : Date.now(),
      });
    };
    onChildAdded(q, handler);
    return () => {
      try { off(q, 'child_added', handler); } catch {}
    };
  } catch (e) {
    console.log('[ChatRTDB] subscribe error', e);
    return () => {};
  }
}

// ============ REACTIONS ============

export function sendReaction(matchId: string, payload: { from: string; to: string; action: string }): void {
  const db = getDB();
  if (!db || !matchId) return;
  try {
    const r = ref(db, `chat/${matchId}/reactions`);
    push(r, { ...payload, time: serverTimestamp() });
  } catch (e) {
    console.log('[ChatRTDB] sendReaction error', e);
  }
}

export function subscribeReactions(
  matchId: string,
  onReaction: (r: ReactionEvent) => void,
): () => void {
  const db = getDB();
  if (!db || !matchId) return () => {};
  try {
    const q = query(ref(db, `chat/${matchId}/reactions`), limitToLast(10));
    const handler = (snap: DataSnapshot) => {
      const val = snap.val();
      if (!val) return;
      onReaction({
        id: snap.key || String(Date.now()),
        from: String(val.from || ''),
        to: String(val.to || ''),
        action: String(val.action || ''),
        time: typeof val.time === 'number' ? val.time : Date.now(),
      });
    };
    onChildAdded(q, handler);
    return () => {
      try { off(q, 'child_added', handler); } catch {}
    };
  } catch (e) {
    console.log('[ChatRTDB] subscribeReactions error', e);
    return () => {};
  }
}
