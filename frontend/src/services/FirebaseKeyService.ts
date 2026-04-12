import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Firebase config from google-services.json
const firebaseConfig = {
  apiKey: 'AIzaSyBCYnmcQBAF6b-cJEiy_npjbHp38jUUX7s',
  projectId: 'cricapp-2092',
  storageBucket: 'cricapp-2092.firebasestorage.app',
  messagingSenderId: '31510956391',
  appId: '1:31510956391:android:f716580ab8638ce52b87c2',
};

// Initialize Firebase (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Cached Firebase key data
let cachedApiKey: string | null = null;
let cachedApiHost: string | null = null;
let fetchAttempted = false;
let fetchPromise: Promise<void> | null = null;

/**
 * Fetch api_key and api_host from Firestore: app_config/settings
 * Returns { apiKey, apiHost } or null if Firebase unavailable
 */
async function fetchFirebaseConfig(): Promise<{ apiKey: string; apiHost: string } | null> {
  try {
    const docRef = doc(db, 'app_config', 'settings');
    const snapshot = await Promise.race([
      getDoc(docRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 5000)),
    ]);

    if (!snapshot || !(snapshot as any).exists?.()) {
      console.log('[Firebase] Document not found or empty');
      return null;
    }

    const data = (snapshot as any).data();
    const apiKey = data?.api_key;
    const apiHost = data?.api_host;

    if (apiKey && apiHost) {
      console.log('[Firebase] Config fetched successfully');
      return { apiKey, apiHost };
    }

    console.log('[Firebase] Missing api_key or api_host in document');
    return null;
  } catch (error: any) {
    console.warn('[Firebase] Fetch failed:', error?.message || 'Unknown error');
    return null;
  }
}

/**
 * Initialize Firebase key fetch - call this on app startup
 * Runs in background, non-blocking
 */
export function initFirebaseKeyFetch(): void {
  if (fetchPromise) return; // Already fetching

  fetchPromise = (async () => {
    try {
      const result = await fetchFirebaseConfig();
      if (result) {
        cachedApiKey = result.apiKey;
        cachedApiHost = result.apiHost;
      }
    } catch {
      // Silent fail - fallback to hardcoded keys
    } finally {
      fetchAttempted = true;
      fetchPromise = null;
    }
  })();
}

/**
 * Get Firebase API key and host (non-blocking)
 * Returns cached values if available, null otherwise
 */
export function getFirebaseKey(): { apiKey: string; apiHost: string } | null {
  if (cachedApiKey && cachedApiHost) {
    return { apiKey: cachedApiKey, apiHost: cachedApiHost };
  }
  return null;
}

/**
 * Wait for Firebase fetch to complete (with timeout)
 * Use this when you need to ensure Firebase was checked
 */
export async function waitForFirebaseKey(timeoutMs: number = 3000): Promise<{ apiKey: string; apiHost: string } | null> {
  // If already fetched, return immediately
  if (fetchAttempted) return getFirebaseKey();

  // Start fetch if not started
  if (!fetchPromise) initFirebaseKeyFetch();

  // Wait with timeout
  try {
    await Promise.race([
      fetchPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {}

  return getFirebaseKey();
}

/**
 * Check if Firebase fetch has been attempted
 */
export function isFirebaseFetchDone(): boolean {
  return fetchAttempted;
}

// Auto-start fetch on module load (background, non-blocking)
initFirebaseKeyFetch();
