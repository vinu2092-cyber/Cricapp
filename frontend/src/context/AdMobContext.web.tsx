/**
 * AdMobContext.web.tsx - Web Mock for AdMob 
 * Web preview can't show real ads, this provides mock functionality
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

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
  const [isAdMobInitialized] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const trackClick = () => {
    setClickCount(c => c + 1);
  };

  const showAppOpenAd = async (): Promise<void> => {
    console.log('[Web Mock] App Open Ad');
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    console.log('[Web Mock] Interstitial Ad');
    return true;
  };

  const showRewardedAd = async (): Promise<boolean> => {
    console.log('[Web Mock] Rewarded Ad - simulating...');
    // Simulate a short delay like watching an ad
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  };

  const BannerAdComponent: React.FC<{ size?: string }> = () => (
    <View style={styles.mockBanner} />
  );

  return (
    <AdMobContext.Provider value={{
      isAdMobInitialized,
      isPro,
      trackClick,
      clickCount,
      showAppOpenAd,
      showInterstitialAd,
      showRewardedAd,
      BannerAdComponent,
    }}>
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
  mockBanner: { height: 0, width: '100%' },
});

export default AdMobProvider;
