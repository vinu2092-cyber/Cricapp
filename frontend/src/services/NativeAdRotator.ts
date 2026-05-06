/**
 * AdRotator (v1.0.16 — BANNER1 REMOVED, Banner2-only fill-rate-optimized)
 * -----------------------------------------------------------------------
 * User update 2026-05-06 (after analysing AdMob daily report v1.0.15):
 *
 *   PROBLEM: Banner #1 (8616886104) was tanking match rate to 0-29% on
 *   most days. Even when ads were served they often did NOT convert to
 *   impressions — the request-to-impression gap was huge ($0.06–$0.12
 *   eCPM dragging down the entire app's average).
 *
 *   FIX: Banner #1 unitId is REMOVED globally. Every slot in the rotation
 *   now points to Banner #2 (`2958604357`) with a different requested
 *   creative size:
 *
 *     Slot 0 → Banner #2 HEADER     — BANNER (320×50)
 *              Above scoreboard. Loads immediately on mount with NO
 *              stagger delay so the request and impression fire in the
 *              same paint cycle.
 *
 *     Slot 1 → Banner #2 CONTEXTUAL — MEDIUM_RECTANGLE (300×250)
 *              Between cricket field and commentary. Also loads on mount
 *              (no stagger) — visibility-guarded so we never request
 *              for an unmounted/off-screen slot.
 *
 * This guarantees: every banner REQUEST corresponds 1:1 with an impression
 * opportunity (component is on-screen when request fires). No more
 * preload-then-unmount before impression burns.
 */
import { BannerAdSize } from 'react-native-google-mobile-ads';

export type AdSlotKind = 'banner';

export type BannerSize = 'standard' | 'medium-rect' | 'inactive';

export interface AdSlotDescriptor {
  kind: AdSlotKind;
  size: BannerSize;
  unitId: string;
  /** 1-based human label for logs. */
  label: string;
}

// v1.0.16 — Banner #1 unitId 8616886104 REMOVED. Every active slot now
// uses Banner #2 unitId 2958604357 because Banner #1 was returning
// near-zero fills. AdMob still serves different creatives across the
// two slots because the requested SIZE differs (320×50 vs 300×250).
const BANNER2_UNIT_ID = 'ca-app-pub-9675798593675825/2958604357';

export const AD_ROTATION: AdSlotDescriptor[] = [
  {
    kind: 'banner',
    size: 'standard',
    unitId: BANNER2_UNIT_ID,
    label: 'Banner #2 HEADER (BANNER 320x50) — was Banner1 slot pre-v1.0.16',
  },
  {
    kind: 'banner',
    size: 'medium-rect',
    unitId: BANNER2_UNIT_ID,
    label: 'Banner #2 CONTEXTUAL (MEDIUM_RECTANGLE 300x250)',
  },
  // Slot 2 intentionally inactive — Banner 3 was removed in v1.0.13.
  // Kept in array so resolveAdSlot(2) doesn't crash; isActive=false
  // tells the card to render nothing.
  {
    kind: 'banner',
    size: 'inactive',
    unitId: '',
    label: 'Slot 2 INACTIVE (Banner 3 removed v1.0.13)',
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
      return BannerAdSize.BANNER; // 320×50 fixed
    case 'medium-rect':
      return BannerAdSize.MEDIUM_RECTANGLE; // 300×250 fixed
    case 'inactive':
    default:
      return BannerAdSize.BANNER; // never rendered
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

/** Next slot — advances shared cursor. */
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

// ---------- Back-compat shims ----------

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
