// ============ PERSISTENT COMMENTARY SERVICE ============
// Uses AsyncStorage to store ball-by-ball commentary per match
// Supports: Sync-on-Open gap detection, Load More pagination
import AsyncStorage from '@react-native-async-storage/async-storage';

const COMMENTARY_PREFIX = 'comm_';
const META_PREFIX = 'comm_meta_';

export interface StoredBall {
  id: string;
  over: string;     // e.g., "12.4"
  overNum: number;   // numeric for sorting: 12.4
  english: string;
  event?: string;
  runs?: number;
  timestamp: number; // when saved
}

export interface CommentaryMeta {
  matchId: string;
  lastOverNum: number;  // Last saved over number (e.g., 12.4)
  lastBallId: string;
  totalBalls: number;
  lastSyncTime: number;
  innings: number;       // Current innings number
}

// ---- SAVE commentary balls to storage (append, no duplicates) ----
export async function saveCommentaryBalls(matchId: string, balls: StoredBall[], innings: number = 1): Promise<void> {
  try {
    const key = `${COMMENTARY_PREFIX}${matchId}_inn${innings}`;
    const existing = await getStoredCommentary(matchId, innings);
    
    // Merge: add only NEW balls (by id)
    const existingIds = new Set(existing.map(b => b.id));
    const newBalls = balls.filter(b => !existingIds.has(b.id));
    
    if (newBalls.length === 0) return; // Nothing new to save
    
    const merged = [...existing, ...newBalls]
      .sort((a, b) => b.overNum - a.overNum); // Latest first
    
    // Save balls
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    
    // Update meta
    const latestBall = merged[0];
    const meta: CommentaryMeta = {
      matchId,
      lastOverNum: latestBall?.overNum || 0,
      lastBallId: latestBall?.id || '',
      totalBalls: merged.length,
      lastSyncTime: Date.now(),
      innings,
    };
    await AsyncStorage.setItem(`${META_PREFIX}${matchId}_inn${innings}`, JSON.stringify(meta));
    
    console.log(`[CommDB] Saved ${newBalls.length} new balls for ${matchId} inn${innings}. Total: ${merged.length}`);
  } catch (e) {
    console.warn('[CommDB] Save error:', e);
  }
}

// ---- GET stored commentary for a match/innings ----
export async function getStoredCommentary(matchId: string, innings: number = 1): Promise<StoredBall[]> {
  try {
    const key = `${COMMENTARY_PREFIX}${matchId}_inn${innings}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data) as StoredBall[];
  } catch (e) {
    console.warn('[CommDB] Read error:', e);
    return [];
  }
}

// ---- GET commentary meta (last saved ball info) ----
export async function getCommentaryMeta(matchId: string, innings: number = 1): Promise<CommentaryMeta | null> {
  try {
    const key = `${META_PREFIX}${matchId}_inn${innings}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data) as CommentaryMeta;
  } catch (e) {
    return null;
  }
}

// ---- GET paginated commentary (for Load More) ----
// Returns `pageSize` balls OLDER than `beforeOverNum`
export async function getCommentaryPage(
  matchId: string,
  innings: number,
  beforeOverNum: number,
  pageSize: number = 12 // ~1-2 overs worth
): Promise<StoredBall[]> {
  const all = await getStoredCommentary(matchId, innings);
  // Sorted latest-first, find items OLDER than beforeOverNum
  const older = all.filter(b => b.overNum < beforeOverNum);
  return older.slice(0, pageSize);
}

// ---- CLEAR commentary for a specific match ----
export async function clearMatchCommentary(matchId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const matchKeys = keys.filter(k => k.includes(matchId) && (k.startsWith(COMMENTARY_PREFIX) || k.startsWith(META_PREFIX)));
    if (matchKeys.length > 0) {
      await AsyncStorage.multiRemove(matchKeys);
      console.log(`[CommDB] Cleared ${matchKeys.length} keys for ${matchId}`);
    }
  } catch (e) {
    console.warn('[CommDB] Clear error:', e);
  }
}

// ---- CLEANUP old match data (matches older than 3 days to reduce storage bloat) ----
export async function cleanupOldCommentary(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const metaKeys = keys.filter(k => k.startsWith(META_PREFIX));
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000); // Reduced from 7 to 3 days
    
    for (const mk of metaKeys) {
      const data = await AsyncStorage.getItem(mk);
      if (!data) continue;
      const meta = JSON.parse(data) as CommentaryMeta;
      if (meta.lastSyncTime < threeDaysAgo) {
        const matchId = meta.matchId;
        await clearMatchCommentary(matchId);
      }
    }
  } catch (e) {
    console.warn('[CommDB] Cleanup error:', e);
  }
}

// ---- SYNC-ON-OPEN: Detect gaps and return missing range ----
// Returns { needsSync: boolean, missingFrom?: number, missingTo?: number }
export async function detectCommentaryGap(
  matchId: string,
  latestOverNum: number,
  innings: number = 1
): Promise<{ needsSync: boolean; missingFrom?: number; missingTo?: number }> {
  try {
    const meta = await getCommentaryMeta(matchId, innings);
    
    if (!meta) {
      // No stored data - need full sync from 0 to latest
      return { needsSync: true, missingFrom: 0, missingTo: latestOverNum };
    }
    
    // Check if there's a gap between stored last over and latest live over
    const gap = latestOverNum - meta.lastOverNum;
    
    if (gap > 0.1) {
      // Gap detected! Need to sync missing overs
      console.log(`[CommDB] Gap detected: stored=${meta.lastOverNum}, latest=${latestOverNum}, gap=${gap.toFixed(1)} overs`);
      return { 
        needsSync: true, 
        missingFrom: meta.lastOverNum, 
        missingTo: latestOverNum 
      };
    }
    
    // No gap - data is up-to-date
    return { needsSync: false };
  } catch (e) {
    console.warn('[CommDB] Gap detection error:', e);
    return { needsSync: false };
  }
}
