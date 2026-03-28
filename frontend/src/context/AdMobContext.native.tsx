/**
 * AdMob Context - Mock Implementation for Expo SDK 54
 * Note: react-native-google-mobile-ads is not compatible with Expo SDK 54
 * This mock implementation maintains the same API for easy switch to real AdMob later
 */
import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Constants from 'expo-constants';

// AdMob Configuration from app.json
export const ADMOB_CONFIG = {
  appId: Constants.expoConfig?.extra?.admob?.appId || 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: Constants.expoConfig?.extra?.admob?.appOpenAdId || 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: Constants.expoConfig?.extra?.admob?.interstitialAdId || 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: Constants.expoConfig?.extra?.admob?.bannerAdId || 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: Constants.expoConfig?.extra?.admob?.rewardedAdId || 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: Constants.expoConfig?.extra?.admob?.testDeviceId || '553c7721-4821-461b-9f62-8584b1e60745',
};

// Random click threshold between 10-15
const getRandomClickThreshold = () => Math.floor(Math.random() * 6) + 10;

// Pro access duration (30 minutes in milliseconds)
const PRO_ACCESS_DURATION = 30 * 60 * 1000;

interface AdMobContextType {
  isPro: boolean;
  isAdMobInitialized: boolean;
  clickCount: number;
  trackClick: () => void;
  showInterstitialAd: () => Promise<void>;
  showRewardedAd: () => Promise<boolean>;
  showAppOpenAd: () => Promise<void>;
  unlockPro: () => void;
  BannerAdComponent: React.FC<{ size?: string }>;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const useAdMob = () => {
  const context = useContext(AdMobContext);
  if (!context) {
    throw new Error('useAdMob must be used within an AdMobProvider');
  }
  return context;
};

// Mock Banner Ad Component
const MockBannerAd: React.FC<{ size?: string }> = ({ size = 'BANNER' }) => {
  return (
    <View style={styles.mockBanner}>
      <Text style={styles.mockBannerText}>AD</Text>
      <Text style={styles.mockBannerSubtext}>Banner Ad Placeholder</Text>
    </View>
  );
};

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [clickThreshold, setClickThreshold] = useState(getRandomClickThreshold());
  const [rewardedAdsWatched, setRewardedAdsWatched] = useState(0);
  const proTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track clicks - show interstitial every 10-15 clicks ONLY for non-Pro users
  const trackClick = () => {
    if (isPro) {
      console.log('[AdMob Mock] Pro user - skipping click-based ad');
      return;
    }
    
    const newCount = clickCount + 1;
    setClickCount(newCount);
    
    if (newCount >= clickThreshold) {
      console.log(`[AdMob Mock] Click threshold reached (${newCount}/${clickThreshold}), showing interstitial`);
      showInterstitialAd();
      setClickCount(0);
      setClickThreshold(getRandomClickThreshold());
    }
  };

  // Show interstitial ad (mock)
  const showInterstitialAd = async (): Promise<void> => {
    console.log('[AdMob Mock] Showing interstitial ad...');
    // In real implementation, this would show actual ad
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('[AdMob Mock] Interstitial ad completed');
        resolve();
      }, 1000);
    });
  };

  // Show rewarded ad (mock) - returns true if user watched the ad
  const showRewardedAd = async (): Promise<boolean> => {
    console.log('[AdMob Mock] Showing rewarded ad...');
    
    return new Promise((resolve) => {
      // Simulate watching ad
      setTimeout(() => {
        const newCount = rewardedAdsWatched + 1;
        setRewardedAdsWatched(newCount);
        console.log(`[AdMob Mock] Rewarded ad completed (${newCount}/3)`);
        
        // After 3 rewarded ads, unlock Pro for 30 minutes
        if (newCount >= 3) {
          console.log('[AdMob Mock] 3 ads watched! Unlocking Pro for 30 minutes...');
          setIsPro(true);
          setRewardedAdsWatched(0);
          
          // Clear any existing timeout
          if (proTimeoutRef.current) {
            clearTimeout(proTimeoutRef.current);
          }
          
          // Set timeout to revoke Pro access after 30 minutes
          proTimeoutRef.current = setTimeout(() => {
            console.log('[AdMob Mock] Pro access expired');
            setIsPro(false);
          }, PRO_ACCESS_DURATION);
        }
        
        resolve(true);
      }, 2000);
    });
  };

  // Show app open ad (mock)
  const showAppOpenAd = async (): Promise<void> => {
    console.log('[AdMob Mock] Showing app open ad...');
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('[AdMob Mock] App open ad completed');
        resolve();
      }, 500);
    });
  };

  // Manual Pro unlock (for testing or special cases)
  const unlockPro = () => {
    showRewardedAd();
  };

  const value: AdMobContextType = {
    isPro,
    isAdMobInitialized,
    clickCount,
    trackClick,
    showInterstitialAd,
    showRewardedAd,
    showAppOpenAd,
    unlockPro,
    BannerAdComponent: MockBannerAd,
  };

  return (
    <AdMobContext.Provider value={value}>
      {children}
    </AdMobContext.Provider>
  );
};

const styles = StyleSheet.create({
  mockBanner: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#444',
    minHeight: 60,
  },
  mockBannerText: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
  },
  mockBannerSubtext: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
});

export default AdMobProvider;
