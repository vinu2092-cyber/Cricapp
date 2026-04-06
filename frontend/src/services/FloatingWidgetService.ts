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
