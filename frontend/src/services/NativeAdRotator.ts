/**
 * AdRotator (v1.0.11 banner-only build)
 * -------------------------------------
 * User spec (2026-04-21 revision):
 *
 *   Native Advanced ads deleted — fill rate was effectively zero (Videoads1
 *   + Videoads2 returned 0 impressions across 96 requests in the last
 *   day). Moving to a **pure banner** alternating rotation:
 *
 *     Slot 0: Banner #1 (MEDIUM RECTANGLE 300×250)
 *     Slot 1: Banner #2 (ANCHORED ADAPTIVE — auto-adjusts to screen width)
 *     Slot 2: Banner #3 (MEDIUM RECTANGLE 300×250)
 *     Slot 3: Banner #1  (cycle repeats…)
 *
 * Different creatives per slot are guaranteed by: (a) each slot uses a
 * DIFFERENT AdMob unit ID, and (b) AdMob's automatic refresh rotates
 * creatives within each unit over time — no extra client logic needed.
 *
 * This module keeps the old export names (`pickNativeAdUnit`,
 * `NATIVE_AD_UNIT_IDS`) as back-compat shims so legacy call sites do not
 * break, but the native-ad code path inside `NativeAdCard.tsx` is gone.
 */
import { BannerAdSize } from 'react-native-google-mobile-ads';

export type AdSlotKind = 'banner';
export type BannerSize = 'medium' | 'adaptive';

export interface AdSlotDescriptor {
  kind: AdSlotKind;
  size: BannerSize;
  unitId: string;
  /** 1-based human label for logs. */
  label: string;
}

// Ordered 3-step rotation — do NOT reorder without updating user spec.
export const AD_ROTATION: AdSlotDescriptor[] = [
  {
    kind: 'banner',
    size: 'medium',
    unitId: 'ca-app-pub-9675798593675825/8616886104',
    label: 'Banner #1 (MEDIUM)',
  },
  {
    kind: 'banner',
    size: 'adaptive',
    unitId: 'ca-app-pub-9675798593675825/2958604357',
    label: 'Banner #2 (ADAPTIVE)',
  },
  {
    kind: 'banner',
    size: 'medium',
    unitId: 'ca-app-pub-9675798593675825/7614346881',
    label: 'Banner #3 (MEDIUM)',
  },
];

/** Maps our abstract size → the google-mobile-ads SDK enum. */
export function resolveBannerSize(size: BannerSize): (typeof BannerAdSize)[keyof typeof BannerAdSize] {
  return size === 'adaptive'
    ? BannerAdSize.ANCHORED_ADAPTIVE_BANNER
    : BannerAdSize.MEDIUM_RECTANGLE;
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
