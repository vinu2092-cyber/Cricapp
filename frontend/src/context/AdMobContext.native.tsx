/**
 * AdMobContext.native.tsx - Native AdMob Implementation for EAS Builds
 * 
 * This file provides full AdMob integration for Android/iOS EAS builds.
 * It uses react-native-google-mobile-ads for native ad functionality.
 * 
 * IMPORTANT: Before EAS build, ensure you:
 * 1. Run: yarn add react-native-google-mobile-ads
 * 2. Update app.json with the AdMob plugin configuration
 * 
 * This file should be renamed to AdMobContext.tsx and replace the web version
 * when building for native platforms.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus, View, StyleSheet } from 'react-native';

// Import native AdMob SDK (only for EAS builds)
import mobileAds, {
  AppOpenAd,
  InterstitialAd,
  RewardedAd,
  BannerAd,
  BannerAdSize,
  AdEventType,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';

// AdMob Configuration - Production IDs
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

// Interstitial trigger every 10 clicks
const INTERSTITIAL_CLICKS = 10;
const INTERSTITIAL_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastInterstitialTime, setLastInterstitialTime] = useState(Date.now());
  
  // Random click target - fixed at 10 clicks
  const [nextInterstitialClickTarget, setNextInterstitialClickTarget] = useState(INTERSTITIAL_CLICKS);
  
  const appOpenAdRef = useRef<any>(null);
  const interstitialAdRef = useRef<any>(null);
  const rewardedAdRef = useRef<any>(null);
  const appStateRef = useRef(AppState.currentState);
  const hasShownInitialAppOpenAd = useRef(false);

  // Initialize AdMob SDK
  useEffect(() => {
    const initializeAdMob = async () => {
      try {
        await mobileAds().initialize();
        
        await mobileAds().setRequestConfiguration({
          testDeviceIdentifiers: [ADMOB_CONFIG.testDeviceId],
        });
        
        console.log('AdMob: SDK initialized successfully');
        setIsAdMobInitialized(true);
        
        // Load App Open Ad (triggers on splash)
        loadAppOpenAd();
        
        // Load Interstitial Ad
        loadInterstitialAd();
        
        // Load Rewarded Ad
        loadRewardedAd();
        
      } catch (error) {
        console.error('AdMob: Initialization failed', error);
        setIsAdMobInitialized(true);
      }
    };

    initializeAdMob();
  }, []);

  // App state listener for App Open Ad
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Show App Open Ad when app returns from background
      if (
        appStateRef.current.match(/inactive|background/) && 
        nextAppState === 'active' &&
        !isPro &&
        appOpenAdRef.current
      ) {
        showAppOpenAd();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isPro]);

  // Load App Open Ad
  const loadAppOpenAd = useCallback(() => {
    appOpenAdRef.current = AppOpenAd.createForAdRequest(ADMOB_CONFIG.appOpenAdId, {
      requestNonPersonalizedAdsOnly: true,
    });

    appOpenAdRef.current.addAdEventListener(AdEventType.LOADED, () => {
      console.log('AdMob: App Open Ad loaded');
      // Show on first load (splash screen)
      if (!hasShownInitialAppOpenAd.current && !isPro) {
        hasShownInitialAppOpenAd.current = true;
        appOpenAdRef.current.show();
      }
    });

    appOpenAdRef.current.addAdEventListener(AdEventType.CLOSED, () => {
      loadAppOpenAd(); // Reload for next time
    });

    appOpenAdRef.current.load();
  }, [isPro]);

  // Load Interstitial Ad
  const loadInterstitialAd = useCallback(() => {
    interstitialAdRef.current = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId, {
      requestNonPersonalizedAdsOnly: true,
    });

    interstitialAdRef.current.addAdEventListener(AdEventType.LOADED, () => {
      console.log('AdMob: Interstitial Ad loaded');
    });

    interstitialAdRef.current.addAdEventListener(AdEventType.CLOSED, () => {
      loadInterstitialAd(); // Reload
    });

    interstitialAdRef.current.load();
  }, []);

  // Load Rewarded Ad
  const loadRewardedAd = useCallback(() => {
    rewardedAdRef.current = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId, {
      requestNonPersonalizedAdsOnly: true,
    });

    rewardedAdRef.current.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('AdMob: Rewarded Ad loaded');
    });

    rewardedAdRef.current.addAdEventListener(AdEventType.CLOSED, () => {
      loadRewardedAd(); // Reload
    });

    rewardedAdRef.current.load();
  }, []);

  // Track clicks for random interstitial (10-15 clicks)
  const trackClick = () => {
    if (isPro) return;
    
    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);
    
    console.log(`AdMob: Click ${newClickCount}/${nextInterstitialClickTarget}`);
    
    // Check if we should show interstitial
    const timeSinceLastInterstitial = Date.now() - lastInterstitialTime;
    const timeIntervalMet = timeSinceLastInterstitial >= INTERSTITIAL_MIN_INTERVAL_MS;
    const clickTargetMet = newClickCount >= nextInterstitialClickTarget;
    
    if (timeIntervalMet && clickTargetMet && interstitialAdRef.current) {
      console.log('AdMob: Showing random interstitial ad');
      showInterstitialAd();
      
      // Reset counters
      setLastInterstitialTime(Date.now());
      setClickCount(0);
      
      // Set new target to 10 clicks
      setNextInterstitialClickTarget(INTERSTITIAL_CLICKS);
    }
  };

  const showAppOpenAd = async () => {
    if (isPro) {
      console.log('AdMob: App Open Ad skipped (Pro user)');
      return;
    }
    
    try {
      await appOpenAdRef.current?.show();
      console.log('AdMob: App Open Ad shown');
    } catch (error) {
      console.error('AdMob: Error showing App Open Ad', error);
    }
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    if (isPro) {
      console.log('AdMob: Interstitial Ad skipped (Pro user)');
      return false;
    }
    
    try {
      await interstitialAdRef.current?.show();
      console.log('AdMob: Interstitial Ad shown');
      return true;
    } catch (error) {
      console.error('AdMob: Error showing Interstitial Ad', error);
      return false;
    }
  };

  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!rewardedAdRef.current) {
        resolve(false);
        return;
      }
      
      const unsubscribeEarn = rewardedAdRef.current.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          console.log('AdMob: Reward earned');
          unsubscribeEarn();
          resolve(true);
          loadRewardedAd();
        }
      );
      
      rewardedAdRef.current.show().catch((error: any) => {
        console.error('AdMob: Error showing Rewarded Ad', error);
        resolve(false);
      });
    });
  };

  const unlockPro = () => {
    setIsPro(true);
    console.log('AdMob: Pro features unlocked');
  };

  const getBannerAdUnitId = () => ADMOB_CONFIG.bannerAdId;

  const shouldShowBannerAd = (index: number): boolean => {
    if (isPro) return false;
    // Show banner after every 6th item (over ends)
    return (index + 1) % 6 === 0;
  };

  // Native Banner Ad Component
  const BannerAdComponent: React.FC<{ style?: any; adPosition?: string }> = ({ style, adPosition }) => {
    if (isPro) return null;
    
    return (
      <View style={[styles.bannerContainer, style]}>
        <BannerAd
          unitId={ADMOB_CONFIG.bannerAdId}
          size={BannerAdSize.BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => console.log('Banner loaded')}
          onAdFailedToLoad={(error) => console.error('Banner failed:', error)}
        />
      </View>
    );
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
  bannerContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  bannerPlaceholder: {
    height: 50,
    backgroundColor: '#F0F0F0',
    marginVertical: 8,
  },
});

export const useAdMob = () => {
  const context = useContext(AdMobContext);
  if (context === undefined) {
    throw new Error('useAdMob must be used within an AdMobProvider');
  }
  return context;
};
