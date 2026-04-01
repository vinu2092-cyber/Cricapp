import { NativeModules, Platform } from 'react-native';

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
  commentary?: string; // Latest commentary for TTS
}

/**
 * Check if floating widget (draw over other apps) is available
 * Only available on Android
 */
export const isFloatingWidgetAvailable = (): boolean => {
  return Platform.OS === 'android' && FloatingWidgetModule != null;
};

/**
 * Check if the app has overlay permission
 * Returns true if permission is granted or not needed
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
 * Request overlay permission
 * Opens system settings for the user to grant permission
 * Returns true if permission already granted, false if user needs to grant it
 */
export const requestOverlayPermission = async (): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    return false;
  }
  try {
    return await FloatingWidgetModule.requestOverlayPermission();
  } catch (error) {
    console.warn('[FloatingWidget] requestOverlayPermission error:', error);
    return false;
  }
};

/**
 * Show the floating score widget overlay
 * Requires overlay permission to be granted
 */
export const showFloatingWidget = async (scoreData: ScoreData): Promise<boolean> => {
  if (!isFloatingWidgetAvailable()) {
    console.warn('[FloatingWidget] Not available on this platform');
    return false;
  }
  try {
    return await FloatingWidgetModule.showFloatingWidget(scoreData);
  } catch (error: any) {
    if (error?.code === 'NO_PERMISSION') {
      console.warn('[FloatingWidget] Overlay permission not granted');
    } else {
      console.warn('[FloatingWidget] showFloatingWidget error:', error);
    }
    return false;
  }
};

/**
 * Update the floating widget with new score data
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
 * Hide/close the floating widget
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
