/**
 * NativeAdRotator
 * ---------------
 * App-wide cyclic dispenser for the 3 Native Advanced ad units the user
 * configured in AdMob console on 2026-04-20. The rule, verbatim:
 *
 *   "Teeno IDs ka use 'Alternate' pattern mein karna hai taaki koi bhi ID
 *    repeat na ho jab tak teeno ek baar show na ho jayein. Pehli placement
 *    par ID-1, dusri par ID-2, teesri par ID-3, aur uske baad hi wapas
 *    ID-1 repeat hogi."
 *
 * We expose ONE shared counter so every <NativeAdCard /> mounted anywhere
 * in the app pulls the next ID in sequence — regardless of whether the
 * placement is the top-of-scoreboard ad, the between-overs ad, or the
 * scorecard/squads tab ad. This guarantees the strict round-robin Google
 * Policy-friendly distribution the user requested.
 *
 * IDs source: the three "Native Advanced" units the user created in the
 * AdMob console (screenshots shared with agent on 2026-04-20).
 */

export const NATIVE_AD_UNIT_IDS = [
  'ca-app-pub-9675798593675825/9123709995', // Native Advanced #1
  'ca-app-pub-9675798593675825/1049778852', // Native Advanced #2
  'ca-app-pub-9675798593675825/6409916742', // Native Advanced #3
];

let rotatorIndex = 0;

/**
 * Return the next ad unit ID and advance the cursor by 1 (modulo 3).
 * Thread-safety isn't a concern in React Native's single JS thread.
 */
export function getNextNativeAdUnit(): string {
  const id = NATIVE_AD_UNIT_IDS[rotatorIndex % NATIVE_AD_UNIT_IDS.length];
  rotatorIndex = (rotatorIndex + 1) % NATIVE_AD_UNIT_IDS.length;
  return id;
}

/**
 * Deterministic picker for render-time usage inside `.map()` loops. Given
 * a stable index (e.g. the n-th over-break in the commentary feed), this
 * returns a stable ID without mutating the global rotator — so React
 * re-renders don't flip the ID on every update. Uses the same round-robin
 * rule: `index % 3`.
 *
 * Callers that want *persistent rotation across mounts* (e.g. the top
 * scoreboard ad which should rotate between match views) should use
 * `getNextNativeAdUnit()` instead.
 */
export function pickNativeAdUnit(index: number): string {
  const safeIdx = Math.max(0, Math.floor(index));
  return NATIVE_AD_UNIT_IDS[safeIdx % NATIVE_AD_UNIT_IDS.length];
}

/** For diagnostics / settings / debug overlays. */
export function currentRotatorIndex(): number {
  return rotatorIndex;
}

/** Reset the rotator — useful in unit tests. Not called in production. */
export function resetNativeAdRotator(): void {
  rotatorIndex = 0;
}
