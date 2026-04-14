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
let cachedProvider: string | null = null;
let fetchAttempted = false;
let fetchPromise: Promise<void> | null = null;

/**
 * Fetch api_key, api_host, and current_provider from Firestore: app_config/settings
 * Returns { apiKey, apiHost, provider } or null if Firebase unavailable
 */
async function fetchFirebaseConfig(): Promise<{ apiKey: string; apiHost: string; provider: string } | null> {
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

    // Cleanse: trim extra whitespace from all fetched values
    const apiKey = (data?.api_key || '').trim();
    const apiHost = (data?.api_host || '').trim();
    const provider = (data?.current_provider || '').trim();

    // Validate: both api_key and api_host must be non-empty after trimming
    if (!apiKey || !apiHost) {
      console.log('[Firebase] Missing or empty api_key/api_host after trimming');
      return null;
    }

    // Reject obviously invalid data (e.g., empty JSON object was returned)
    if (apiKey.length < 10) {
      console.log('[Firebase] api_key looks invalid (too short)');
      return null;
    }

    console.log(`[Firebase] Config fetched successfully. Provider: ${provider || 'unknown'}, Host: ${apiHost}`);
    return { apiKey, apiHost, provider: provider || 'cricbuzz-cricket' };
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
        cachedProvider = result.provider;
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
 * Get Firebase API key, host, and provider (non-blocking)
 * Returns cached values if available, null otherwise
 */
export function getFirebaseKey(): { apiKey: string; apiHost: string; provider: string } | null {
  if (cachedApiKey && cachedApiHost) {
    return { apiKey: cachedApiKey, apiHost: cachedApiHost, provider: cachedProvider || 'cricbuzz-cricket' };
  }
  return null;
}

/**
 * Wait for Firebase fetch to complete (with timeout)
 * Use this when you need to ensure Firebase was checked before falling back
 */
export async function waitForFirebaseKey(timeoutMs: number = 5000): Promise<{ apiKey: string; apiHost: string; provider: string } | null> {
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
