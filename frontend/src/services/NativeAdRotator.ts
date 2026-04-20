/**
 * NativeAdRotator (v1.0.11 — banner + native alternating rotation)
 * ----------------------------------------------------------------
 * User spec (2026-04-20 update):
 *
 *   Slot 0: Banner #1   (Banner format — MEDIUM RECTANGLE, 300×250)
 *   Slot 1: Videoads #1 (Native Advanced)
 *   Slot 2: Banner #2   (Banner format)
 *   Slot 3: Videoads #2 (Native Advanced)
 *   Slot 4: Banner #1   (cycle repeats)
 *   ...
 *
 * The TOP placement on the match screen (below the scoreboard) is the
 * Banner #1 medium rectangle. All subsequent on-page ad slots (between
 * overs in commentary, end-of-scorecard, end-of-squads, etc.) cycle
 * through the 4-ID pattern above.
 *
 * Native Advanced #3 (`6409916742`) was deleted from the AdMob console
 * by the user and is no longer referenced here.
 *
 * AdMob policy: each render site already enforces a 1-over / 1-section
 * spacing gap before the next ad, so the 4-slot cycle guarantees the
 * same format never repeats back-to-back on screen.
 */

export type AdSlotKind = 'banner' | 'native';

export interface AdSlotDescriptor {
  kind: AdSlotKind;
  unitId: string;
  /** 1-based human label for logs ("Banner #1", "Native #2"). */
  label: string;
}

// Ordered 4-step rotation — do NOT reorder without updating the user spec.
export const AD_ROTATION: AdSlotDescriptor[] = [
  { kind: 'banner', unitId: 'ca-app-pub-9675798593675825/8616886104', label: 'Banner #1' },
  { kind: 'native', unitId: 'ca-app-pub-9675798593675825/9123709995', label: 'Native #1 (Videoads1)' },
  { kind: 'banner', unitId: 'ca-app-pub-9675798593675825/2958604357', label: 'Banner #2' },
  { kind: 'native', unitId: 'ca-app-pub-9675798593675825/1049778852', label: 'Native #2 (Videoads2)' },
];

/** Legacy export — retained for any caller that only wants native IDs. */
export const NATIVE_AD_UNIT_IDS = AD_ROTATION
  .filter(s => s.kind === 'native')
  .map(s => s.unitId);

let rotatorIndex = 0;

/**
 * Return the next ad slot descriptor and advance the shared cursor.
 * Use when you need a NEW ad on every mount (rare).
 */
export function getNextAdSlot(): AdSlotDescriptor {
  const slot = AD_ROTATION[rotatorIndex % AD_ROTATION.length];
  rotatorIndex = (rotatorIndex + 1) % AD_ROTATION.length;
  return slot;
}

/**
 * Deterministic slot resolver — given a stable index (e.g. n-th over-break
 * in the commentary feed, or 0 for the top match placement), return the
 * exact slot descriptor. Stable across re-renders. Use this everywhere the
 * ad is mounted inside a `.map()` / render tree so React reconciliation
 * doesn't swap the ad unit on every render.
 */
export function resolveAdSlot(index: number): AdSlotDescriptor {
  const safeIdx = Math.max(0, Math.floor(index));
  return AD_ROTATION[safeIdx % AD_ROTATION.length];
}

/**
 * Backwards-compat helper — kept because CommentarySection and other
 * callers import `pickNativeAdUnit`. Returns the unit ID regardless of
 * whether that slot is banner or native. Prefer `resolveAdSlot()` for
 * new code.
 */
export function pickNativeAdUnit(index: number): string {
  return resolveAdSlot(index).unitId;
}

/**
 * Legacy alias for `getNextAdSlot().unitId` — pre-v1.0.11 call sites.
 */
export function getNextNativeAdUnit(): string {
  return getNextAdSlot().unitId;
}

/** For diagnostics / debug overlays. */
export function currentRotatorIndex(): number {
  return rotatorIndex;
}

/** Reset the rotator — useful in unit tests. Not called in production. */
export function resetNativeAdRotator(): void {
  rotatorIndex = 0;
}
