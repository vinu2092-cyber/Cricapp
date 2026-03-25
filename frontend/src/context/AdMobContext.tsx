import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus, View, Text, StyleSheet } from 'react-native';

// AdMob Configuration from app.json - Production IDs
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

// Interstitial timing configuration - RANDOM 10-15 CLICKS as per requirement
const INTERSTITIAL_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const INTERSTITIAL_MIN_CLICKS = 10; // Minimum clicks before showing
const INTERSTITIAL_MAX_CLICKS = 15; // Maximum clicks before showing

// Check platform - AdMob only works on native (EAS builds)
const isWeb = Platform.OS === 'web';

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  clickCount: number;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  unlockPro: () => void;
  getBannerAdUnitId: () => string;
  shouldShowBannerAd: (index: number) => boolean;
  BannerAdComponent: React.FC<{ style?: any; adPosition?: string }>;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

// Banner placeholder component (web preview & fallback)
const BannerPlaceholder: React.FC<{ style?: any; adPosition?: string }> = ({ style, adPosition }) => (
  <View style={[styles.bannerPlaceholder, style]}>
    <Text style={styles.bannerLabel}>ADVERTISEMENT</Text>
    <Text style={styles.bannerText}>Banner Ad {adPosition ? `- ${adPosition}` : ''}</Text>
    <Text style={styles.bannerSubText}>AdMob ID: {ADMOB_CONFIG.bannerAdId}</Text>
  </View>
);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastInterstitialTime, setLastInterstitialTime] = useState(Date.now());
  const [nextInterstitialClickTarget, setNextInterstitialClickTarget] = useState(
    Math.floor(Math.random() * (INTERSTITIAL_MAX_CLICKS - INTERSTITIAL_MIN_CLICKS + 1)) + INTERSTITIAL_MIN_CLICKS
  );
  
  const appStateRef = useRef(AppState.currentState);

  // Log AdMob configuration on mount
  useEffect(() => {
    console.log('AdMob Configuration:', {
      platform: Platform.OS,
      isWeb,
      config: ADMOB_CONFIG,
      note: isWeb ? 'Running on web - ads show placeholders. Real ads in EAS builds.' : 'Native platform detected',
    });
    
    if (isWeb) {
      console.log('AdMob: Web platform - banner placeholders shown. App Open/Interstitial/Rewarded ads require native EAS build.');
    }
  }, []);

  // App state listener (for App Open Ad trigger in native builds)
  useEffect(() => {
    if (isWeb) return;
    
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) && 
        nextAppState === 'active' &&
        !isPro
      ) {
        console.log('AdMob: App returning to foreground - App Open Ad would trigger in EAS build');
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isPro]);

  const trackClick = () => {
    if (isPro) return;
    
    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);
    
    // Interstitial logic (placeholder for native)
    const timeSinceLastInterstitial = Date.now() - lastInterstitialTime;
    const timeIntervalMet = timeSinceLastInterstitial >= INTERSTITIAL_MIN_INTERVAL_MS;
    const clickTargetMet = newClickCount >= nextInterstitialClickTarget;
    
    if (timeIntervalMet && clickTargetMet) {
      console.log('AdMob: Interstitial would show here in EAS build');
      setLastInterstitialTime(Date.now());
      setClickCount(0);
      setNextInterstitialClickTarget(
        Math.floor(Math.random() * (INTERSTITIAL_MAX_CLICKS - INTERSTITIAL_MIN_CLICKS + 1)) + INTERSTITIAL_MIN_CLICKS
      );
    }
  };

  const showAppOpenAd = async () => {
    console.log('AdMob: App Open Ad triggered (shows in EAS build)');
    // In EAS build, this would show the App Open Ad
    // App Open Ad Unit ID: ca-app-pub-9675798593675825/4826782503
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    console.log('AdMob: Interstitial Ad triggered (shows in EAS build)');
    // In EAS build, this would show the Interstitial Ad
    // Interstitial Ad Unit ID: ca-app-pub-9675798593675825/8438724452
    return true;
  };

  const showRewardedAd = async (): Promise<boolean> => {
    console.log('AdMob: Rewarded Ad triggered (shows in EAS build)');
    // In EAS build, this would show the Rewarded Ad and wait for reward
    // Rewarded Ad Unit ID: ca-app-pub-9675798593675825/6702740458
    
    // On web, simulate success for testing the Pro unlock flow
    if (isWeb) {
      console.log('AdMob: Simulating reward completion on web');
      return true;
    }
    
    return true;
  };

  const unlockPro = () => {
    setIsPro(true);
    console.log('AdMob: Pro features unlocked - ads disabled');
  };

  const getBannerAdUnitId = () => ADMOB_CONFIG.bannerAdId;

  // Determine when to show banner ads in commentary/over sections
  const shouldShowBannerAd = (index: number): boolean => {
    if (isPro) return false;
    // Show banner after every 6th item (over ends) or every 10th item
    return (index + 1) % 6 === 0 || (index + 1) % 10 === 0;
  };

  // Banner Ad Component - always shows placeholder in web preview
  // Real BannerAd will be implemented in EAS build with native AdMob SDK
  const BannerAdComponent: React.FC<{ style?: any; adPosition?: string }> = ({ style, adPosition }) => {
    if (isPro) return null;
    return <BannerPlaceholder style={style} adPosition={adPosition} />;
  };

  return (
    <AdMobContext.Provider
      value={{
        isAdMobInitialized,
        isPro,
        trackClick,
        clickCount,
        showAppOpenAd,
        showInterstitialAd,
        showRewardedAd,
        unlockPro,
        getBannerAdUnitId,
        shouldShowBannerAd,
        BannerAdComponent,
      }}
    >
      {children}
    </AdMobContext.Provider>
  );
};

const styles = StyleSheet.create({
  bannerPlaceholder: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  bannerLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  bannerSubText: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
});

export const useAdMob = () => {
  const context = useContext(AdMobContext);
  if (context === undefined) {
    throw new Error('useAdMob must be used within an AdMobProvider');
  }
  return context;
};

/*
 * ==========================================
 * EAS BUILD INSTRUCTIONS FOR FULL ADMOB
 * ==========================================
 * 
 * Before running EAS build, add react-native-google-mobile-ads:
 * 
 * 1. yarn add react-native-google-mobile-ads
 * 
 * 2. Update app.json plugins:
 *    "plugins": [
 *      "expo-router",
 *      ["react-native-google-mobile-ads", {
 *        "androidAppId": "ca-app-pub-9675798593675825~2399929714",
 *        "iosAppId": "ca-app-pub-9675798593675825~2399929714"
 *      }]
 *    ]
 * 
 * 3. Create src/context/AdMobContext.native.tsx with full implementation
 *    that imports from 'react-native-google-mobile-ads'
 * 
 * Ad Unit IDs (Production):
 * - App Open: ca-app-pub-9675798593675825/4826782503
 * - Interstitial: ca-app-pub-9675798593675825/8438724452
 * - Banner: ca-app-pub-9675798593675825/8616886104
 * - Rewarded: ca-app-pub-9675798593675825/6702740458
 * - Test Device: 553c7721-4821-461b-9f62-8584b1e60745
 */
