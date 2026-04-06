import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * AdMobContext.tsx - Fallback/Web Stub for AdMob
 * This file is used when .native.tsx is not resolved.
 * Real ads only work in native EAS builds via AdMobContext.native.tsx
 */

// Re-export native version for native platforms
if (Platform.OS !== 'web') {
  console.log('[AdMob] Using native AdMob context');
}

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  isRewardedAdReady: boolean;
  isRewardedAdLoading: boolean;
  adsWatchedCount: number;
  BannerAdComponent: React.FC<{ size?: string }>;
}

export type { AdMobContextType };

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized] = useState(true);
  const [isPro] = useState(false);
  const [adsWatchedCount, setAdsWatchedCount] = useState(0);

  const showAppOpenAd = async (): Promise<void> => {};
  const showInterstitialAd = async (): Promise<boolean> => false;
  const showRewardedAd = async (): Promise<boolean> => {
    // Simulate ad completion for web dev testing
    return new Promise((resolve) => {
      setTimeout(() => {
        setAdsWatchedCount(prev => (prev + 1) % 4);
        resolve(true);
      }, 500);
    });
  };

  const trackClick = () => {};

  // Placeholder banner for web - shows visible placeholder
  const BannerAdComponent: React.FC<{ size?: string }> = () => (
    <View style={styles.adStub}>
      {Platform.OS === 'web' && (
        <View style={styles.adPlaceholder} />
      )}
    </View>
  );

  return (
    <AdMobContext.Provider
      value={{
        isAdMobInitialized,
        isPro,
        trackClick,
        showAppOpenAd,
        showInterstitialAd,
        showRewardedAd,
        isRewardedAdReady: true,
        isRewardedAdLoading: false,
        adsWatchedCount,
        BannerAdComponent,
      }}
    >
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = (): AdMobContextType => {
  const context = useContext(AdMobContext);
  if (!context) throw new Error('useAdMob must be used within AdMobProvider');
  return context;
};

const styles = StyleSheet.create({
  adStub: { width: '100%' },
  adPlaceholder: { 
    height: 50, 
    backgroundColor: '#f0f0f0', 
    borderRadius: 4,
    marginVertical: 4,
  },
});

export default AdMobProvider;
