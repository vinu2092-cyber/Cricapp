/**
 * AdRotator (v1.0.12 — 3-role banner spec)
 * ----------------------------------------
 * User spec (2026-04-21 revision 2):
 *
 *   Three distinct banner ROLES, each with a DIFFERENT size + unit-id so
 *   Google doesn't serve the same creative twice on the same screen:
 *
 *     Slot 0 → Banner #1 HEADER      — BANNER 320×50
 *              (top-of-match strip, above scoreboard, full width)
 *     Slot 1 → Banner #2 CONTEXTUAL  — MEDIUM_RECTANGLE 300×250
 *              (between scoreboard + CricketField and first commentary row)
 *     Slot 2 → Banner #3 OVER-BREAK  — LARGE_BANNER 320×100
 *              (between last ball of prev over and first ball of current over)
 *
 * slotIndex % 3 wraps so callers that pass 3, 4, 5… keep cycling but in
 * practice every call site pins its slotIndex to exactly one of {0,1,2}.
 *
 * Different creatives per slot are guaranteed by: (a) each slot uses a
 * DIFFERENT AdMob unit ID, (b) DIFFERENT AdMob banner size, and (c)
 * AdMob's automatic refresh rotates creatives within each unit over time.
 */
import { BannerAdSize } from 'react-native-google-mobile-ads';

export type AdSlotKind = 'banner';
// User spec sizes:
//   'standard' → BANNER 320×50  (header role)
//   'medium'   → MEDIUM_RECTANGLE 300×250 (contextual role)
//   'large'    → LARGE_BANNER 320×100 (over-break role)
//   'adaptive' → ANCHORED_ADAPTIVE_BANNER (kept for back-compat only)
export type BannerSize = 'standard' | 'medium' | 'large' | 'adaptive';

export interface AdSlotDescriptor {
  kind: AdSlotKind;
  size: BannerSize;
  unitId: string;
  /** 1-based human label for logs. */
  label: string;
}

// Ordered 3-role rotation — do NOT reorder without updating the call sites.
// Every call site pins to a specific slotIndex:
//   match/[id].tsx top-of-page          → slotIndex=0 (header)
//   match/[id].tsx below field          → slotIndex=1 (contextual)
//   CommentarySection over-break        → slotIndex=2 (over-break)
//   CommentarySection empty state       → slotIndex=1 (contextual)
//   CommentarySection upcoming analysis → slotIndex=1 (contextual)
export const AD_ROTATION: AdSlotDescriptor[] = [
  {
    kind: 'banner',
    size: 'standard',
    unitId: 'ca-app-pub-9675798593675825/8616886104',
    label: 'Banner #1 HEADER (320×50)',
  },
  {
    kind: 'banner',
    size: 'medium',
    unitId: 'ca-app-pub-9675798593675825/2958604357',
    label: 'Banner #2 CONTEXTUAL (300×250)',
  },
  {
    kind: 'banner',
    size: 'large',
    unitId: 'ca-app-pub-9675798593675825/7614346881',
    label: 'Banner #3 OVER-BREAK (320×100)',
  },
];

/** Maps our abstract size → the google-mobile-ads SDK enum. */
export function resolveBannerSize(size: BannerSize): (typeof BannerAdSize)[keyof typeof BannerAdSize] {
  switch (size) {
    case 'standard':
      return BannerAdSize.BANNER; // 320×50
    case 'medium':
      return BannerAdSize.MEDIUM_RECTANGLE; // 300×250
    case 'large':
      return BannerAdSize.LARGE_BANNER; // 320×100
    case 'adaptive':
    default:
      return BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
  }
}

/** Minimum container height (px) per size — keeps layout stable during load. */
export function minHeightForSize(size: BannerSize): number {
  switch (size) {
    case 'standard':
      return 50;
    case 'medium':
      return 250;
    case 'large':
      return 100;
    case 'adaptive':
    default:
      return 60;
  }
}

let rotatorIndex = 0;

/** Next slot — advances shared cursor. Use for one-off fresh rotation. */
export function getNextAdSlot(): AdSlotDescriptor {
  const slot = AD_ROTATION[rotatorIndex % AD_ROTATION.length];
  rotatorIndex = (rotatorIndex + 1) % AD_ROTATION.length;
  return slot;
}

/** Deterministic slot resolver — stable across re-renders. */
export function resolveAdSlot(index: number): AdSlotDescriptor {
  const safeIdx = Math.max(0, Math.floor(index));
  return AD_ROTATION[safeIdx % AD_ROTATION.length];
}

// ---------- Back-compat shims (do not remove — still imported by some callers) ----------

export const NATIVE_AD_UNIT_IDS = AD_ROTATION.map(s => s.unitId);

export function pickNativeAdUnit(index: number): string {
  return resolveAdSlot(index).unitId;
}

export function getNextNativeAdUnit(): string {
  return getNextAdSlot().unitId;
}

export function currentRotatorIndex(): number {
  return rotatorIndex;
}

export function resetNativeAdRotator(): void {
  rotatorIndex = 0;
}
