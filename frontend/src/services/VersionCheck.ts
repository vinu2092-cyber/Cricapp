/**
 * VersionCheck.ts — Forced-update version control.
 *
 * Reads `latest_version` and `min_supported_version` from Firestore
 * (`app_config/settings` document) and compares with the installed app
 * version (from app.json via expo-constants).
 *
 * Returns:
 *   - forceUpdate: true   → installed < min_supported_version. Show blocking
 *                            screen, user MUST update via Play Store.
 *   - optionalUpdate: true → installed < latest_version (but >= min_supported).
 *                            Show dismissable update prompt (optional UX).
 *
 * SAFETY: If Firestore is unreachable or fields are missing, returns
 * { forceUpdate: false, optionalUpdate: false }. Network failure NEVER
 * accidentally locks out users.
 */

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRESTORE_PROJECT = 'cricapp-2092';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/app_config/settings`;
const CACHE_KEY = 'cricapp_version_check_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min cache
const FETCH_TIMEOUT_MS = 4000;

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.cricapp.live';

export interface VersionCheckResult {
  installedVersion: string;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  forceUpdate: boolean;
  optionalUpdate: boolean;
  playStoreUrl: string;
}

function getInstalledVersion(): string {
  // Constants.expoConfig.version is set from app.json "version" field
  const v = (Constants?.expoConfig as any)?.version || (Constants as any)?.manifest?.version;
  return typeof v === 'string' ? v : '0.0.0';
}

/**
 * Compare two semantic version strings.
 * Returns: -1 if a<b, 0 if a==b, 1 if a>b.
 * Tolerates missing components ("1.0" == "1.0.0").
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0);
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

async function fetchVersionFromFirestore(): Promise<{ latest: string | null; min: string | null; storeUrl: string | null } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(FIRESTORE_URL, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json: any = await res.json();
    const fields = json?.fields || {};
    return {
      latest: fields?.latest_version?.stringValue || null,
      min: fields?.min_supported_version?.stringValue || null,
      storeUrl: fields?.play_store_url?.stringValue || null,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the latest version-check result. Uses 30-min cache to avoid
 * hammering Firestore on every app launch.
 */
export async function checkAppVersion(forceRefresh = false): Promise<VersionCheckResult> {
  const installed = getInstalledVersion();
  const baseResult: VersionCheckResult = {
    installedVersion: installed,
    latestVersion: null,
    minSupportedVersion: null,
    forceUpdate: false,
    optionalUpdate: false,
    playStoreUrl: PLAY_STORE_URL,
  };

  // Try cache
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && Date.now() - parsed.ts < CACHE_TTL_MS) {
          return computeUpdateFlags({
            ...baseResult,
            latestVersion: parsed.latest || null,
            minSupportedVersion: parsed.min || null,
            playStoreUrl: parsed.storeUrl || PLAY_STORE_URL,
          });
        }
      }
    } catch {}
  }

  // Fetch fresh
  const fresh = await fetchVersionFromFirestore();
  if (!fresh) {
    // Network failed — safest behaviour: do NOT force update
    return baseResult;
  }

  // Persist cache
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      latest: fresh.latest,
      min: fresh.min,
      storeUrl: fresh.storeUrl,
      ts: Date.now(),
    }));
  } catch {}

  return computeUpdateFlags({
    ...baseResult,
    latestVersion: fresh.latest,
    minSupportedVersion: fresh.min,
    playStoreUrl: fresh.storeUrl || PLAY_STORE_URL,
  });
}

function computeUpdateFlags(r: VersionCheckResult): VersionCheckResult {
  let forceUpdate = false;
  let optionalUpdate = false;
  if (r.minSupportedVersion && compareVersions(r.installedVersion, r.minSupportedVersion) < 0) {
    forceUpdate = true;
  }
  if (!forceUpdate && r.latestVersion && compareVersions(r.installedVersion, r.latestVersion) < 0) {
    optionalUpdate = true;
  }
  return { ...r, forceUpdate, optionalUpdate };
}
