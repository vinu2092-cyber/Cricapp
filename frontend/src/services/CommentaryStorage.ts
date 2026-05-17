import AsyncStorage from '@react-native-async-storage/async-storage';
import { Commentary } from '../types/match';

const COMM_STORAGE_PREFIX = 'cricapp_commhistory_';
const MAX_COMMENTARY_PER_MATCH = 1500; // Covers full ODI (600 balls) + commentary-only rows comfortably

/**
 * Check if match is International or League (not Domestic)
 * Only persist commentary for International and League matches
 */
export function shouldPersistCommentary(
  category?: string,
  seriesName?: string,
  matchType?: string
): boolean {
  // If category is explicitly set
  if (category) {
    const cat = category.toLowerCase();
    if (cat === 'domestic') return false;
    if (cat === 'international' || cat === 'league' || cat === 'women') return true;
  }

  // Heuristic from series name
  if (seriesName) {
    const sn = seriesName.toLowerCase();
    const domesticKeywords = [
      'ranji', 'sheffield', 'plunket', 'county', 'vijay hazare',
      'syed mushtaq', 'duleep', 'deodhar', 'irani', 'domestic',
      'first-class', 'list a'
    ];
    for (const kw of domesticKeywords) {
      if (sn.includes(kw)) return false;
    }
  }

  // Default: persist (International/League/Unknown)
  return true;
}

/**
 * Save commentary to local storage for a match
 * Merges with existing stored commentary (dedup by id)
 */
export async function saveCommentary(
  matchId: string,
  commentary: Commentary[]
): Promise<void> {
  if (!matchId || !commentary || commentary.length === 0) return;

  try {
    const key = `${COMM_STORAGE_PREFIX}${matchId}`;
    const existing = await loadCommentary(matchId);

    // Merge: existing + new, deduplicate by id
    const idSet = new Set<string>();
    const merged: Commentary[] = [];

    // Add new commentary first (freshest data)
    for (const c of commentary) {
      if (c.id && !idSet.has(c.id)) {
        idSet.add(c.id);
        merged.push(c);
      }
    }

    // Then add existing stored commentary
    for (const c of existing) {
      if (c.id && !idSet.has(c.id)) {
        idSet.add(c.id);
        merged.push(c);
      }
    }

    // Limit storage size
    const toStore = merged.slice(0, MAX_COMMENTARY_PER_MATCH);

    await AsyncStorage.setItem(key, JSON.stringify({
      matchId,
      updatedAt: Date.now(),
      commentary: toStore,
    }));

    console.log(`[CommStorage] Saved ${toStore.length} items for match ${matchId}`);
  } catch (e) {
    console.warn('[CommStorage] Save failed:', e);
  }
}

/**
 * Load stored commentary for a match
 */
export async function loadCommentary(matchId: string): Promise<Commentary[]> {
  if (!matchId) return [];

  try {
    const key = `${COMM_STORAGE_PREFIX}${matchId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return parsed.commentary || [];
  } catch (e) {
    console.warn('[CommStorage] Load failed:', e);
    return [];
  }
}

/**
 * Merge fresh API commentary with stored commentary
 * Returns deduplicated, sorted array (newest ball first = descending over.ball)
 */
export function mergeCommentary(
  fresh: Commentary[],
  stored: Commentary[]
): Commentary[] {
  const idSet = new Set<string>();
  const merged: Commentary[] = [];

  // Fresh first (priority)
  for (const c of fresh) {
    if (c.id && !idSet.has(c.id)) {
      idSet.add(c.id);
      merged.push(c);
    }
  }

  // Stored after
  for (const c of stored) {
    if (c.id && !idSet.has(c.id)) {
      idSet.add(c.id);
      merged.push(c);
    }
  }

  // Sort by over.ball descending (latest ball first)
  merged.sort((a, b) => {
    const overA = parseFloat(a.over || '0');
    const overB = parseFloat(b.over || '0');
    // Non-ball entries (over=0 or empty) go to the end
    if (overA === 0 && overB !== 0) return 1;
    if (overB === 0 && overA !== 0) return -1;
    return overB - overA;
  });

  return merged;
}

/**
 * Clean up old commentary storage (matches older than 7 days)
 */
export async function cleanupOldCommentary(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const commKeys = allKeys.filter(k => k.startsWith(COMM_STORAGE_PREFIX));
    const fortyEightHoursAgo = Date.now() - 72 * 60 * 60 * 1000;

    for (const key of commKeys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.updatedAt && parsed.updatedAt < fortyEightHoursAgo) {
            await AsyncStorage.removeItem(key);
          }
        }
      } catch {}
    }
  } catch {}
}
