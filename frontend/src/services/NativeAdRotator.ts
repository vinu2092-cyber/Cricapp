/**
 * AdRotator (v1.0.13 — 2-banner fill-rate-optimized spec)
 * --------------------------------------------------------
 * User update 2026-04-22 (after analysing AdMob daily report):
 *
 *   BEFORE (rev-3.2): 3 banner slots, all adaptive full-width.
 *   Report showed:
 *     • Banner 1 (8616886104): MISSING from report — 0 prod impressions
 *     • Banner 2 (2958604357): 14.29% match rate, $0.05 eCPM
 *     • Banner 3 (7614346881): 290 requests, 29.66% match rate, $0.12 eCPM
 *     Aggregate: avg match rate 37.78%, eCPM $0.43 — TANKED by Banner 3.
 *
 *   AFTER (v1.0.13): 2 banner slots only. Banner 3 REMOVED from code.
 *   Commentary section is now 100% ad-free. Sizes reverted to standard
 *   fixed formats with the highest historical fill rates on AdMob:
 *
 *     Slot 0 → Banner #1 HEADER      — BANNER (320×50)
 *              Above scoreboard. Immediate load, NO stagger. The earlier
 *              ANCHORED_ADAPTIVE_BANNER format was returning 0
 *              impressions on production devices — reverted to plain
 *              BANNER which is the most compatible format across old
 *              Android versions and reliably hits AdMob servers.
 *
 *     Slot 1 → Banner #2 CONTEXTUAL  — MEDIUM_RECTANGLE (300×250)
 *              Between scoreboard+field and commentary. Loads 3s after
 *              Banner 1 (staggered). Switched back from
 *              INLINE_ADAPTIVE_BANNER (14% match rate) to the classic
 *              MEDIUM_RECTANGLE — consistently best-filling banner size
 *              in AdMob's auction.
 *
 *     Slot 2 → DEAD. Kept as unreachable stub so legacy callers (if any)
 *              don't crash. Old Banner 3 unit ID 7614346881 is no longer
 *              referenced anywhere in the app.
 *
 * Trade-off: fewer requests (no more 290/day from over-breaks) means
 * slightly less total fill volume but MUCH higher match rate and eCPM.
 * User brief: "रिक्वेस्ट बेशक कम हो। हमें अपनी रिपोर्ट खराब नहीं करनी है।"
 */
import { BannerAdSize } from 'react-native-google-mobile-ads';

export type AdSlotKind = 'banner';

// Only two ABSTRACT sizes remain in production use.
// 'medium-rect' is kept for legacy alias compatibility.
export type BannerSize = 'standard' | 'medium-rect' | 'inactive';

export interface AdSlotDescriptor {
  kind: AdSlotKind;
  size: BannerSize;
  unitId: string;
  /** 1-based human label for logs. */
  label: string;
}

// Ordered 2-role rotation. Slot 2 is INACTIVE — callers that still pass
// slotIndex=2 will receive a no-op placeholder.
//
// Call sites after v1.0.13:
//   match/[id].tsx top-of-page  → slotIndex=0 (header)
//   match/[id].tsx below field  → slotIndex=1 (contextual)
//   CommentarySection           → NO LONGER CALLS NativeAdCard for
//                                 over-breaks. Commentary is ad-free.
export const AD_ROTATION: AdSlotDescriptor[] = [
  {
    kind: 'banner',
    size: 'standard',
    unitId: 'ca-app-pub-9675798593675825/8616886104',
    label: 'Banner #1 HEADER (BANNER 320x50)',
  },
  {
    kind: 'banner',
    size: 'medium-rect',
    unitId: 'ca-app-pub-9675798593675825/2958604357',
    label: 'Banner #2 CONTEXTUAL (MEDIUM_RECTANGLE 300x250)',
  },
  // Slot 2 intentionally inactive — Banner 3 removed per v1.0.13 plan.
  // Kept in array so resolveAdSlot(2) doesn't crash but isActive=false
  // tells the card to render nothing.
  {
    kind: 'banner',
    size: 'inactive',
    unitId: '',
    label: 'Banner #3 REMOVED (v1.0.13)',
  },
];

/** True if the slot should actually render an ad. */
export function isSlotActive(slot: AdSlotDescriptor): boolean {
  return slot.size !== 'inactive' && !!slot.unitId;
}

/** Maps our abstract size → the google-mobile-ads SDK enum. */
export function resolveBannerSize(size: BannerSize): (typeof BannerAdSize)[keyof typeof BannerAdSize] {
  switch (size) {
    case 'standard':
      // 320×50 fixed — highest compatibility, best fill rate for headers.
      return BannerAdSize.BANNER;
    case 'medium-rect':
      // 300×250 fixed — classic IAB Medium Rectangle. Consistently
      // highest-filling banner size in AdMob's auction.
      return BannerAdSize.MEDIUM_RECTANGLE;
    case 'inactive':
    default:
      return BannerAdSize.BANNER; // never rendered; placeholder only
  }
}

/** Minimum container height (px) per size — keeps layout stable during load. */
export function minHeightForSize(size: BannerSize): number {
  switch (size) {
    case 'standard':
      return 50;
    case 'medium-rect':
      return 250;
    case 'inactive':
    default:
      return 0;
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

// ---------- Back-compat shims (kept so old imports don't break) ----------

export const NATIVE_AD_UNIT_IDS = AD_ROTATION.filter(isSlotActive).map(s => s.unitId);

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
