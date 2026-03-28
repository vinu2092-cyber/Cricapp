/**
 * AdMobContext.native.tsx - REAL AdMob Implementation for Native Builds
 * 
 * Uses react-native-google-mobile-ads for actual AdMob integration.
 * Rewarded ads: 3 ads required to unlock Pro for 30 minutes
 * Interstitial: Shown every 10-15 clicks for non-Pro users
 * Banner: Shown in commentary section for non-Pro users
 * App Open: Shown on app launch for all users
 */

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

// AdMob Configuration - Real Ad Unit IDs
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

// Random click threshold between 10-15
const getRandomClickThreshold = () => Math.floor(Math.random() * 6) + 10;

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  clickCount: number;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  BannerAdComponent: React.FC<{ size?: string }>;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

// Try to import real AdMob SDK
let mobileAds: any = null;
let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let InterstitialAd: any = null;
let AdEventType: any = null;
let AppOpenAd: any = null;
let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
let sdkAvailable = false;

try {
  const admobModule = require('react-native-google-mobile-ads');
  mobileAds = admobModule.default;
  RewardedAd = admobModule.RewardedAd;
  RewardedAdEventType = admobModule.RewardedAdEventType;
  InterstitialAd = admobModule.InterstitialAd;
  AdEventType = admobModule.AdEventType;
  AppOpenAd = admobModule.AppOpenAd;
  BannerAd = admobModule.BannerAd;
  BannerAdSize = admobModule.BannerAdSize;
  TestIds = admobModule.TestIds;
  sdkAvailable = true;
  console.log('[AdMob] SDK loaded successfully');
} catch (e) {
  console.log('[AdMob] SDK not available, using mock mode');
  sdkAvailable = false;
}

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [clickThreshold, setClickThreshold] = useState(getRandomClickThreshold());
  const proTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize AdMob SDK with test device
  useEffect(() => {
    const initAdMob = async () => {
      if (sdkAvailable && mobileAds) {
        try {
          // Configure test device for debugging
          await mobileAds().setRequestConfiguration({
            testDeviceIdentifiers: [ADMOB_CONFIG.testDeviceId],
          });
          
          await mobileAds().initialize();
          console.log('[AdMob] Initialized successfully with test device:', ADMOB_CONFIG.testDeviceId);
          setIsAdMobInitialized(true);
          
          // Note: App Open Ad is now handled in _layout.tsx for ALL users
        } catch (error) {
          console.error('[AdMob] Init error:', error);
          setIsAdMobInitialized(true); // Continue even if init fails
        }
      } else {
        console.log('[AdMob] Running in mock mode');
        setIsAdMobInitialized(true);
      }
    };
    
    initAdMob();
    
    return () => {
      if (proTimeoutRef.current) {
        clearTimeout(proTimeoutRef.current);
      }
    };
  }, []);

  // Track clicks - show interstitial every 10-15 clicks ONLY for non-Pro users
  // Pro users (after watching 3 ads) get 30 minutes without click-based ads
  const trackClick = () => {
    if (isPro) {
      console.log('[AdMob] Pro user - skipping click-based ad');
      return; // Pro users don't see click-based interstitial ads
    }
    
    const newCount = clickCount + 1;
    setClickCount(newCount);
    
    if (newCount >= clickThreshold) {
      console.log(`[AdMob] Click threshold reached (${newCount}/${clickThreshold}), showing interstitial for non-Pro user`);
      showInterstitialAd();
      setClickCount(0);
      setClickThreshold(getRandomClickThreshold()); // New random threshold
    }
  };

  // App Open Ad
  const showAppOpenAd = async (): Promise<void> => {
    if (!sdkAvailable || !AppOpenAd) {
      console.log('[AdMob Mock] App Open Ad');
      return;
    }
    
    try {
      const appOpenAd = AppOpenAd.createForAdRequest(ADMOB_CONFIG.appOpenAdId);
      
      return new Promise<void>((resolve) => {
        const unsubLoaded = appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
          appOpenAd.show();
          unsubLoaded();
        });
        
        const unsubClosed = appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
          unsubClosed();
          resolve();
        });
        
        const unsubError = appOpenAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
          console.log('[AdMob] App Open Ad error:', error);
          unsubError();
          resolve();
        });
        
        appOpenAd.load();
        
        // Timeout after 10 seconds
        setTimeout(() => resolve(), 10000);
      });
    } catch (error) {
      console.error('[AdMob] App Open Ad error:', error);
    }
  };

  // Interstitial Ad
  const showInterstitialAd = async (): Promise<boolean> => {
    if (isPro) return false; // Pro users don't see interstitials
    
    if (!sdkAvailable || !InterstitialAd) {
      console.log('[AdMob Mock] Interstitial Ad');
      return true;
    }
    
    try {
      const interstitial = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId);
      
      return new Promise<boolean>((resolve) => {
        const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
          interstitial.show();
          unsubLoaded();
        });
        
        const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
          unsubClosed();
          resolve(true);
        });
        
        const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
          console.log('[AdMob] Interstitial error:', error);
          unsubError();
          resolve(false);
        });
        
        interstitial.load();
        
        setTimeout(() => resolve(false), 15000);
      });
    } catch (error) {
      console.error('[AdMob] Interstitial error:', error);
      return false;
    }
  };

  // Rewarded Ad - Used for Pro unlock (user watches 3 of these)
  const showRewardedAd = async (): Promise<boolean> => {
    if (!sdkAvailable || !RewardedAd) {
      console.log('[AdMob Mock] Rewarded Ad - mock success');
      return true;
    }
    
    try {
      const rewarded = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId);
      
      return new Promise<boolean>((resolve) => {
        let rewarded_earned = false;
        
        const unsubLoaded = rewarded.addAdEventListener(AdEventType.LOADED, () => {
          rewarded.show();
          unsubLoaded();
        });
        
        const unsubEarned = rewarded.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          (reward: any) => {
            console.log('[AdMob] Reward earned:', reward);
            rewarded_earned = true;
            unsubEarned();
          }
        );
        
        const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
          unsubClosed();
          resolve(rewarded_earned);
        });
        
        const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (error: any) => {
          console.log('[AdMob] Rewarded Ad error:', error);
          unsubError();
          resolve(false);
        });
        
        rewarded.load();
        
        // Timeout after 30 seconds
        setTimeout(() => resolve(false), 30000);
      });
    } catch (error) {
      console.error('[AdMob] Rewarded Ad error:', error);
      return false;
    }
  };

  // Banner Ad Component
  const BannerAdComponent: React.FC<{ size?: string }> = ({ size = 'BANNER' }) => {
    if (!sdkAvailable || !BannerAd || !BannerAdSize) {
      return <View style={styles.mockBanner} />;
    }
    
    try {
      const adSize = BannerAdSize[size] || BannerAdSize.BANNER;
      return (
        <BannerAd
          unitId={ADMOB_CONFIG.bannerAdId}
          size={adSize}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
        />
      );
    } catch (error) {
      return <View style={styles.mockBanner} />;
    }
  };

  const value: AdMobContextType = {
    isAdMobInitialized,
    isPro,
    trackClick,
    clickCount,
    showAppOpenAd,
    showInterstitialAd,
    showRewardedAd,
    BannerAdComponent,
  };

  return (
    <AdMobContext.Provider value={value}>
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = (): AdMobContextType => {
  const context = useContext(AdMobContext);
  if (!context) {
    throw new Error('useAdMob must be used within AdMobProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  mockBanner: {
    height: 0,
    width: '100%',
  },
});

export default AdMobProvider;
