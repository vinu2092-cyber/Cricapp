/**
 * VoicePrefs (v1.0.16 Rev 4)
 * --------------------------
 * Tiny module-level singleton that lets the React commentary section
 * picker (English / Hindi / Excited) communicate the user's choice to
 * the native floating-widget service without going through React
 * Context — match/[id].tsx reads it once per UPDATE_SCORE intent
 * payload, so a setter + getter pair is all we need.
 *
 * Default: 'english'. Hindi voice is opt-in AND only honoured by the
 * native widget when a real Devanagari `commentaryHindi` string is
 * pushed alongside (so the same v1.0.15 "Hindi voice on English text =
 * gibberish" bug can NEVER reach production).
 */

export type VoiceMode = 'english' | 'hindi' | 'excited';

let currentMode: VoiceMode = 'english';
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
