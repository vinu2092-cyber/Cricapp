import { NativeModules, Platform, Linking } from 'react-native';

const { FloatingWidgetModule } = NativeModules;

// Debug logging
console.log('[FloatingWidget] Platform:', Platform.OS);
console.log('[FloatingWidget] NativeModules available:', Object.keys(NativeModules));
console.log('[FloatingWidget] FloatingWidgetModule:', FloatingWidgetModule);

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
 * Check if floating widget (draw over other apps) is available
 * Only available on Android with native module properly linked
 */
export const isFloatingWidgetAvailable = (): boolean => {
  const available = Platform.OS === 'android' && FloatingWidgetModule != null;
  console.log('[FloatingWidget] isFloatingWidgetAvailable:', available, 'Platform:', Platform.OS, 'Module:', !!FloatingWidgetModule);
  return available;
};

/**
 * Check if the app has overlay permission
 * Returns true if permission is granted or not needed
 */
export const checkOverlayPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.log('[FloatingWidget] Not Android, returning false');
    return false;
  }
  
  if (!FloatingWidgetModule) {
    console.log('[FloatingWidget] Native module not available, returning false');
    return false;
  }
  
  try {
    const result = await FloatingWidgetModule.checkOverlayPermission();
    console.log('[FloatingWidget] checkOverlayPermission result:', result);
    return result;
  } catch (error) {
    console.warn('[FloatingWidget] checkOverlayPermission error:', error);
    return false;
  }
};

/**
 * Request overlay permission - Opens system settings
 * Uses Linking API as fallback if native module fails
 */
export const requestOverlayPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.log('[FloatingWidget] Not Android');
    return false;
  }
  
  // Try native module first
  if (FloatingWidgetModule) {
    try {
      console.log('[FloatingWidget] Calling native requestOverlayPermission');
      const result = await FloatingWidgetModule.requestOverlayPermission();
      console.log('[FloatingWidget] Native requestOverlayPermission result:', result);
      return result;
    } catch (error) {
      console.warn('[FloatingWidget] Native requestOverlayPermission failed:', error);
    }
  }
  
  // Fallback: Open app settings using Linking
  console.log('[FloatingWidget] Using Linking.openSettings fallback');
  try {
    await Linking.openSettings();
    return false;
  } catch (linkError) {
    console.warn('[FloatingWidget] Linking.openSettings also failed:', linkError);
    return false;
  }
};

/**
 * Show the floating score widget overlay
 */
export const showFloatingWidget = async (scoreData: ScoreData): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.warn('[FloatingWidget] Not available - not Android');
    return false;
  }
  
  if (!FloatingWidgetModule) {
    console.warn('[FloatingWidget] Not available - native module is null');
    return false;
  }
  
  try {
    console.log('[FloatingWidget] Calling showFloatingWidget with data:', scoreData);
    const result = await FloatingWidgetModule.showFloatingWidget(scoreData);
    console.log('[FloatingWidget] showFloatingWidget result:', result);
    return result;
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
