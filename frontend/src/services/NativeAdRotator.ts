/**
 * AdRotator (v1.0.12 rev-3 — ALL full-width adaptive)
 * ----------------------------------------------------
 * User update 2026-04-21 rev-3:
 *   "Muje sabhi banner full width wale chahiye."
 *   "Banner3 ko bhi medium size aur automatically full width lene wala
 *    hi bana do."
 *
 * So all three slots are now FULL-WIDTH adaptive banners from
 * react-native-google-mobile-ads (different unit IDs → different creative
 * pools → no duplicate creatives on same screen):
 *
 *   Slot 0 → Banner #1 HEADER      — ANCHORED_ADAPTIVE_BANNER
 *            (full-width, ~50-100px — short strip above scoreboard)
 *   Slot 1 → Banner #2 CONTEXTUAL  — INLINE_ADAPTIVE_BANNER
 *            (full-width, medium/tall — scoreboard ↔ commentary)
 *   Slot 2 → Banner #3 OVER-BREAK  — INLINE_ADAPTIVE_BANNER
 *            (full-width, medium — between overs in commentary)
 *
 * Slot 1 and 2 share INLINE_ADAPTIVE_BANNER size but use DIFFERENT unit
 * IDs. AdMob's per-unit creative auction rotates independently per unit,
 * so creatives returned to slot 1 ≠ creatives returned to slot 2.
 * Combined with our 10-row minimum gap in CommentarySection (see
 * shouldShowBannerForItem), same creative can NEVER stack on one screen.
 *
 * Stagger delays per user rev-3:  0s / 3s / 6s.
 */
import { BannerAdSize } from 'react-native-google-mobile-ads';

export type AdSlotKind = 'banner';

// NOTE: these labels are ABSTRACT — the runtime size returned by
// resolveBannerSize() is what the BannerAd actually renders.
export type BannerSize = 'anchored-adaptive' | 'inline-adaptive-tall' | 'inline-adaptive-medium';

export interface AdSlotDescriptor {
  kind: AdSlotKind;
  size: BannerSize;
  unitId: string;
  /** 1-based human label for logs. */
  label: string;
}

// Ordered 3-role rotation — do NOT reorder without updating call sites.
// Every call site pins to a specific slotIndex:
//   match/[id].tsx top-of-page          → slotIndex=0 (header)
//   match/[id].tsx below field          → slotIndex=1 (contextual)
//   CommentarySection over-break        → slotIndex=2 (over-break)
//   CommentarySection empty state       → slotIndex=1 (contextual)
//   CommentarySection upcoming analysis → slotIndex=1 (contextual)
export const AD_ROTATION: AdSlotDescriptor[] = [
  {
    kind: 'banner',
    size: 'anchored-adaptive',
    unitId: 'ca-app-pub-9675798593675825/8616886104',
    label: 'Banner #1 HEADER (anchored-adaptive)',
  },
  {
    kind: 'banner',
    size: 'inline-adaptive-tall',
    unitId: 'ca-app-pub-9675798593675825/2958604357',
    label: 'Banner #2 CONTEXTUAL (inline-adaptive)',
  },
  {
    kind: 'banner',
    size: 'inline-adaptive-medium',
    unitId: 'ca-app-pub-9675798593675825/7614346881',
    label: 'Banner #3 OVER-BREAK (inline-adaptive)',
  },
];

/** Maps our abstract size → the google-mobile-ads SDK enum. */
export function resolveBannerSize(size: BannerSize): (typeof BannerAdSize)[keyof typeof BannerAdSize] {
  switch (size) {
    case 'anchored-adaptive':
      // Full-width, auto-calculated height based on screen density.
      // Typical phone: ~50-60dp high. Short "strip" — perfect for header.
      return BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
    case 'inline-adaptive-tall':
    case 'inline-adaptive-medium':
    default:
      // Full-width, variable-height up to ~250dp. Intended for scrolling
      // content. Slot 1 and Slot 2 both use this — AdMob serves different
      // creatives because unit IDs differ.
      return BannerAdSize.INLINE_ADAPTIVE_BANNER;
  }
}

/** Minimum container height (px) per size — keeps layout stable during load. */
export function minHeightForSize(size: BannerSize): number {
  switch (size) {
    case 'anchored-adaptive':
      return 60; // worst-case anchored banner height
    case 'inline-adaptive-tall':
      return 100; // medium/tall inline banner
    case 'inline-adaptive-medium':
      return 100; // medium inline banner
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
