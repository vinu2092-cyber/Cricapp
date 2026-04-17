/**
 * FirebaseKeyService - Multi-Provider Key Rotation
 * Uses direct REST API for Firestore (no SDK dependency issues)
 */

const FIRESTORE_PROJECT = 'cricapp-2092';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/app_config/settings`;

// ============ TYPES ============
interface ProviderKeys {
  name: string;
  host: string;
  keys: string[];
}

// ============ STATE ============
let cachedProviders: ProviderKeys[] = [];
let fetchAttempted = false;
let fetchPromise: Promise<void> | null = null;
const failedKeys = new Set<string>();

// Debug log - stores last errors for visibility
let lastDebugLog: string[] = [];
export function getDebugLog(): string[] { return lastDebugLog; }

function debugLog(msg: string) {
  console.log(`[Firebase] ${msg}`);
  lastDebugLog.push(msg);
  if (lastDebugLog.length > 20) lastDebugLog.shift();
}

// ============ Helper: parse comma-separated keys ============
function parseKeys(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(k => k.replace(/\s+/g, '')).filter(k => k.length > 10);
}

// ============ Helper: derive provider name from host ============
function deriveProviderName(host: string): string {
  // cricbuzz-cricket.p.rapidapi.com -> cricbuzz-cricket
  // cricbuzz-cricket2.p.rapidapi.com -> cricbuzz-cricket2
  // cricbuzz-real-time-cricket-api.p.rapidapi.com -> cricbuzz-real-time
  const parts = host.split('.p.rapidapi.com')[0] || host;
  // For "cricbuzz-real-time-cricket-api" -> "cricbuzz-real-time"
  if (parts.includes('real-time')) return 'cricbuzz-real-time';
  return parts;
}

// ============ FETCH CONFIG VIA REST API (no SDK needed) ============
// Reads 3 hosts (api_host, api_host_p2, api_host_p3) and their keys from Firestore
async function fetchFirebaseConfig(): Promise<void> {
  try {
    debugLog('Fetching config via REST API...');

    const response = await fetch(FIRESTORE_URL, { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      debugLog(`REST API error: ${response.status} ${response.statusText}`);
      await fetchFirebaseConfigSDK();
      return;
    }

    const json = await response.json();
    const fields = json?.fields;

    if (!fields) {
      debugLog('No fields in Firestore response');
      await fetchFirebaseConfigSDK();
      return;
    }

    const currentProvider = (fields?.current_provider?.stringValue || 'cricbuzz-cricket').replace(/\s+/g, '');
    debugLog(`current_provider: ${currentProvider}`);

    // ---- Read all 3 hosts and their keys ----
    const hostConfigs: { host: string; keysRaw: string; suffix: string }[] = [
      { host: (fields?.api_host?.stringValue || '').replace(/\s+/g, ''), keysRaw: (fields?.api_key?.stringValue || '').trim(), suffix: '' },
      { host: (fields?.api_host_p2?.stringValue || '').replace(/\s+/g, ''), keysRaw: (fields?.api_key_p2?.stringValue || '').trim(), suffix: '_p2' },
      { host: (fields?.api_host_p3?.stringValue || '').replace(/\s+/g, ''), keysRaw: (fields?.api_key_p3?.stringValue || '').trim(), suffix: '_p3' },
    ];

    // Build providers list, current_provider FIRST
    const allProviders: ProviderKeys[] = [];

    for (const hc of hostConfigs) {
      if (!hc.host || !hc.keysRaw) {
        debugLog(`Skipping empty host${hc.suffix}`);
        continue;
      }
      const keys = parseKeys(hc.keysRaw);
      if (keys.length === 0) {
        debugLog(`No valid keys for host${hc.suffix}: ${hc.host}`);
        continue;
      }
      const name = deriveProviderName(hc.host);
      // Shuffle keys for load distribution
      const shuffled = keys.sort(() => Math.random() - 0.5);
      allProviders.push({ name, host: hc.host, keys: shuffled });
      debugLog(`Host${hc.suffix}: ${hc.host} | ${name} | ${keys.length} keys`);
    }

    if (allProviders.length === 0) {
      debugLog('No valid providers found in Firestore');
      return;
    }

    // Sort: current_provider first, rest in order
    allProviders.sort((a, b) => {
      if (a.name === currentProvider) return -1;
      if (b.name === currentProvider) return 1;
      return 0;
    });

    cachedProviders = allProviders;
    debugLog(`SUCCESS: ${allProviders.length} providers loaded. Order: ${allProviders.map(p => p.name).join(' -> ')}`);

  } catch (error: any) {
    debugLog(`REST fetch failed: ${error?.message || 'Unknown'}`);
    try {
      await fetchFirebaseConfigSDK();
    } catch (e2: any) {
      debugLog(`SDK fallback also failed: ${e2?.message || 'Unknown'}`);
    }
  }
}

// ============ FALLBACK: SDK-based fetch ============
async function fetchFirebaseConfigSDK(): Promise<void> {
  try {
    debugLog('Trying SDK fallback...');
    const { initializeApp, getApps, getApp } = require('firebase/app');
    const { getFirestore, doc, getDoc } = require('firebase/firestore');

    const firebaseConfig = {
      apiKey: 'AIzaSyBCYnmcQBAF6b-cJEiy_npjbHp38jUUX7s',
      projectId: 'cricapp-2092',
      storageBucket: 'cricapp-2092.firebasestorage.app',
      messagingSenderId: '31510956391',
      appId: '1:31510956391:android:f716580ab8638ce52b87c2',
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

    const docRef = doc(db, 'app_config', 'settings');
    const snapshot = await Promise.race([
      getDoc(docRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('SDK timeout 8s')), 8000)),
    ]);

    if (!snapshot || !snapshot.exists?.()) {
      debugLog('SDK: Document not found');
      return;
    }

    const data = snapshot.data();
    if (!data) return;

    const currentProvider = (data?.current_provider || 'cricbuzz-cricket').replace(/\s+/g, '');

    // Read all 3 hosts and keys (same structure as REST)
    const hostConfigs = [
      { host: (data?.api_host || '').replace(/\s+/g, ''), keysRaw: (data?.api_key || '').trim(), suffix: '' },
      { host: (data?.api_host_p2 || '').replace(/\s+/g, ''), keysRaw: (data?.api_key_p2 || '').trim(), suffix: '_p2' },
      { host: (data?.api_host_p3 || '').replace(/\s+/g, ''), keysRaw: (data?.api_key_p3 || '').trim(), suffix: '_p3' },
    ];

    const allProviders: ProviderKeys[] = [];
    for (const hc of hostConfigs) {
      if (!hc.host || !hc.keysRaw) continue;
      const keys = parseKeys(hc.keysRaw);
      if (keys.length === 0) continue;
      const name = deriveProviderName(hc.host);
      allProviders.push({ name, host: hc.host, keys: keys.sort(() => Math.random() - 0.5) });
      debugLog(`SDK Host${hc.suffix}: ${hc.host} | ${keys.length} keys`);
    }

    if (allProviders.length > 0 && cachedProviders.length === 0) {
      // Sort: current_provider first
      allProviders.sort((a, b) => {
        if (a.name === currentProvider) return -1;
        if (b.name === currentProvider) return 1;
        return 0;
      });
      cachedProviders = allProviders;
      debugLog(`SDK SUCCESS: ${allProviders.length} providers loaded`);
    }
  } catch (error: any) {
    debugLog(`SDK error: ${error?.message || 'Unknown'}`);
  }
}

// ============ PUBLIC API ============

export function initFirebaseKeyFetch(): void {
  if (fetchPromise) return;
  fetchPromise = (async () => {
    try {
      await fetchFirebaseConfig();
    } catch (e: any) {
      debugLog(`Init error: ${e?.message}`);
    } finally {
      fetchAttempted = true;
      fetchPromise = null;
    }
  })();
}

export function getFirebaseKey(): { apiKey: string; apiHost: string; provider: string } | null {
  if (cachedProviders.length === 0) return null;
  for (const provider of cachedProviders) {
    const validKey = provider.keys.find(k => !failedKeys.has(k));
    if (validKey) {
      return { apiKey: validKey, apiHost: provider.host, provider: provider.name };
    }
  }
  // All keys failed - reset and try again
  failedKeys.clear();
  const first = cachedProviders[0];
  if (first && first.keys.length > 0) {
    return { apiKey: first.keys[0], apiHost: first.host, provider: first.name };
  }
  return null;
}

export function getAllProviders(): ProviderKeys[] {
  return cachedProviders;
}

export function markKeyFailed(key: string): void {
  failedKeys.add(key);
  debugLog(`Key failed: ${key.substring(0, 15)}... (${failedKeys.size} total failed)`);
}

export function resetFailedKeys(): void {
  failedKeys.clear();
}

export async function waitForFirebaseKey(timeoutMs: number = 5000): Promise<{ apiKey: string; apiHost: string; provider: string } | null> {
  if (fetchAttempted) return getFirebaseKey();
  if (!fetchPromise) initFirebaseKeyFetch();
  try {
    await Promise.race([
      fetchPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {}
  return getFirebaseKey();
}

export function isFirebaseFetchDone(): boolean {
  return fetchAttempted;
}

// Auto-start
initFirebaseKeyFetch();
