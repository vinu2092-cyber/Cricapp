import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * AdMobContext.web.tsx - Web Platform Stub for AdMob
 * Web platform cannot display native ads. This provides a no-op implementation
 * so the app runs without errors on web during development.
 * Real ads only work in native EAS builds.
 */

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

export type { AdMobContextType };

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized] = useState(true);
  const [isPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const showAppOpenAd = async (): Promise<void> => {};
  const showInterstitialAd = async (): Promise<boolean> => false;
  const showRewardedAd = async (): Promise<boolean> => {
    // Simulate ad completion for web dev testing
    return new Promise((resolve) => setTimeout(() => resolve(true), 500));
  };

  const trackClick = () => setClickCount((p) => p + 1);

  const BannerAdComponent: React.FC<{ size?: string }> = () => (
    <View style={styles.adStub} />
  );

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
  adStub: { height: 0, width: '100%' },
});

export default AdMobProvider;
