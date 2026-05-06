import { NativeModules, Platform, Linking } from 'react-native';

const { FloatingWidgetModule } = NativeModules;

interface ScoreData {
  team1Name: string;
  team2Name: string;
  team1Score: string;
  team2Score: string;
  team1Overs?: string;
  team2Overs?: string;
  statusText?: string;
  batsmanName?: string;
  bowlerName?: string;
  commentary?: string;
  // v1.0.16 — overlay UX directives (2026-05-06):
  //   • battingTeam: 'team1' | 'team2' — only this row is rendered.
  //     The non-batting team's row is hidden until they come out to bat.
  //   • bowlerOverBalls: ball-by-ball string of the CURRENT over only
  //     (e.g. "1 4 . . W"). Previous-over balls are NOT shown.
  battingTeam?: 'team1' | 'team2';
  bowlerOverBalls?: string;
  // v1.0.16 Rev 4 — voice prefs for the floating overlay's TTS.
  //   • voiceLanguage: 'en-IN' | 'hi-IN' — picks Locale on the native side.
  //   • voiceRate / voicePitch: tuneable for "Excited" mode.
  //   • voiceMuted: stops native TTS without tearing down the widget.
  //   • commentaryHindi: editorial Hindi text for this ball (only set
  //     when present + Devanagari-validated by api.ts). When language
  //     is 'hi-IN', the native side speaks THIS string. If absent,
  //     native side stays silent rather than reading english (avoids
  //     the v1.0.15 Hindi-voice-reading-English gibberish bug).
  voiceLanguage?: 'en-IN' | 'hi-IN';
  voiceRate?: number;
  voicePitch?: number;
  voiceMuted?: boolean;
  commentaryHindi?: string;
}

/**
 * Check if floating widget is available
 */
export const isFloatingWidgetAvailable = (): boolean => {
  return Platform.OS === 'android' && FloatingWidgetModule != null;
};

/**
 * Check overlay permission
 */
export const checkOverlayPermission = async (): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    return false;
  }
  try {
    return await FloatingWidgetModule.checkOverlayPermission();
  } catch (error) {
    console.warn('[FloatingWidget] checkOverlayPermission error:', error);
    return false;
  }
};

/**
 * Request overlay permission - Opens system settings
 */
export const requestOverlayPermission = async (): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    // Fallback: Open general settings
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('[FloatingWidget] Could not open settings');
    }
    return false;
  }
  try {
    return await FloatingWidgetModule.requestOverlayPermission();
  } catch (error) {
    console.warn('[FloatingWidget] requestOverlayPermission error:', error);
    // Fallback
    try {
      await Linking.openSettings();
    } catch (e) {}
    return false;
  }
};

/**
 * Show the floating score widget
 */
export const showFloatingWidget = async (scoreData: ScoreData): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    return false;
  }
  try {
    return await FloatingWidgetModule.showFloatingWidget(scoreData);
  } catch (error: any) {
    console.warn('[FloatingWidget] showFloatingWidget error:', error);
    return false;
  }
};

/**
 * Update the floating widget with new score
 */
export const updateFloatingWidget = async (scoreData: ScoreData): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    return false;
  }
  try {
    return await FloatingWidgetModule.updateFloatingWidget(scoreData);
  } catch (error) {
    console.warn('[FloatingWidget] updateFloatingWidget error:', error);
    return false;
  }
};

/**
 * Hide the floating widget
 */
export const hideFloatingWidget = async (): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    return false;
  }
  try {
    return await FloatingWidgetModule.hideFloatingWidget();
  } catch (error) {
    console.warn('[FloatingWidget] hideFloatingWidget error:', error);
    return false;
  }
};

export default {
  isFloatingWidgetAvailable,
  checkOverlayPermission,
  requestOverlayPermission,
  showFloatingWidget,
  updateFloatingWidget,
  hideFloatingWidget,
};
