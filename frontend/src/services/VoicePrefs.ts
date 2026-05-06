/**
 * VoicePrefs (v1.0.16 Rev 5)
 * --------------------------
 * Tiny module-level singleton that lets the React commentary section
 * picker (Hindi Excited / English Excited) communicate the user's choice
 * to the native floating-widget service without going through React
 * Context — match/[id].tsx reads it once per UPDATE_SCORE intent
 * payload, so a setter + getter pair is all we need.
 *
 * v1.0.16 Rev 5 (2026-05-06, user directive):
 *   "Hindi excited / English excited rakho. Jo excited wala features
 *    h isko dono language mein rakh do."
 * So normal Hindi / English / Excited (3 options) are COLLAPSED into
 * exactly two: hindi_excited, english_excited. Both use the excited
 * rate+pitch profile; the only difference is the speech locale.
 *
 * Default: 'english_excited'. Hindi voice is opt-in AND only honoured by
 * the native widget when a real Devanagari `commentaryHindi` string is
 * pushed alongside (so the same v1.0.15 "Hindi voice on English text =
 * gibberish" bug can NEVER reach production).
 */

export type VoiceMode = 'english_excited' | 'hindi_excited';

let currentMode: VoiceMode = 'english_excited';
let muted = false;

export function setVoiceMode(mode: VoiceMode): void {
  currentMode = mode;
}

export function getVoiceMode(): VoiceMode {
  return currentMode;
}

export function setVoiceMuted(value: boolean): void {
  muted = value;
}

export function isVoiceMuted(): boolean {
  return muted;
}
