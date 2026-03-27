/**
 * AdMobContext.native.tsx - Mock AdMob Implementation
 * 
 * This is a mock implementation that preserves all AdMob functionality
 * without requiring the react-native-google-mobile-ads package.
 * 
 * All ads are mocked - the app works perfectly without breaking.
 * Pro features, click tracking, and all UI elements remain functional.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

// Mock AdMob Configuration
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

const INTERSTITIAL_CLICKS = 10;

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

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(true); // Mock as initialized
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [rewardedAdsWatched, setRewardedAdsWatched] = useState(0);

  // Mock initialization
  useEffect(() => {
    console.log('[Mock AdMob] Initialized');
    setIsAdMobInitialized(true);
  }, []);

  // Track clicks (for interstitial ad logic)
  const trackClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    
    // Show interstitial every 10 clicks (mocked)
    if (newCount % INTERSTITIAL_CLICKS === 0 && !isPro) {
      console.log('[Mock AdMob] Would show interstitial ad at', newCount, 'clicks');
    }
  };

  // Mock App Open Ad
  const showAppOpenAd = async (): Promise<void> => {
    console.log('[Mock AdMob] App Open Ad (mocked)');
    return Promise.resolve();
  };

  // Mock Interstitial Ad
  const showInterstitialAd = async (): Promise<boolean> => {
    if (isPro) {
      console.log('[Mock AdMob] Pro user - skipping interstitial');
      return false;
    }
    
    console.log('[Mock AdMob] Interstitial Ad (mocked)');
    return Promise.resolve(true);
  };

  // Mock Rewarded Ad (for Pro unlock)
  const showRewardedAd = async (): Promise<boolean> => {
    console.log('[Mock AdMob] Rewarded Ad (mocked)');
    
    // Simulate watching ad
    const newCount = rewardedAdsWatched + 1;
    setRewardedAdsWatched(newCount);
    
    // Unlock Pro after 3 ads
    if (newCount >= 3) {
      setIsPro(true);
      setRewardedAdsWatched(0);
      
      // Auto-expire Pro after 30 minutes
      setTimeout(() => {
        setIsPro(false);
        console.log('[Mock AdMob] Pro expired');
      }, 30 * 60 * 1000);
      
      console.log('[Mock AdMob] Pro unlocked for 30 minutes!');
    }
    
    return Promise.resolve(true);
  };

  // Mock Banner Ad Component
  const BannerAdComponent: React.FC<{ size?: string }> = ({ size = 'BANNER' }) => {
    return (
      <View style={styles.mockBanner}>
        {/* Empty view - no actual banner shown */}
      </View>
    );
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
    height: 0, // No height since we're not showing ads
    width: '100%',
  },
});

export default AdMobProvider;
