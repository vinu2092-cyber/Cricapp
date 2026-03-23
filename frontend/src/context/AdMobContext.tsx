import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';

// AdMob Configuration from app.json - These IDs will be used in native builds
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

// Interstitial timing configuration
const INTERSTITIAL_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const INTERSTITIAL_MAX_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const INTERSTITIAL_MIN_CLICKS = 12;
const INTERSTITIAL_MAX_CLICKS = 16;

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
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastInterstitialTime, setLastInterstitialTime] = useState(Date.now());
  const [nextInterstitialClickTarget, setNextInterstitialClickTarget] = useState(
    Math.floor(Math.random() * (INTERSTITIAL_MAX_CLICKS - INTERSTITIAL_MIN_CLICKS + 1)) + INTERSTITIAL_MIN_CLICKS
  );

  const trackClick = () => {
    if (isPro) return;
    
    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);
    
    // Check if we should show interstitial (only on native)
    if (Platform.OS === 'web') return;
    
    const timeSinceLastInterstitial = Date.now() - lastInterstitialTime;
    const timeIntervalMet = timeSinceLastInterstitial >= INTERSTITIAL_MIN_INTERVAL_MS;
    const clickTargetMet = newClickCount >= nextInterstitialClickTarget;
    
    if (timeIntervalMet && clickTargetMet) {
      showInterstitialAd();
      setLastInterstitialTime(Date.now());
      setClickCount(0);
      setNextInterstitialClickTarget(
        Math.floor(Math.random() * (INTERSTITIAL_MAX_CLICKS - INTERSTITIAL_MIN_CLICKS + 1)) + INTERSTITIAL_MIN_CLICKS
      );
    }
  };

  const showAppOpenAd = async () => {
    // Implemented in native builds only
    console.log('AdMob: App Open Ad (native only)');
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    console.log('AdMob: Interstitial Ad (native only)');
    return false;
  };

  const showRewardedAd = async (): Promise<boolean> => {
    // On web, simulate rewarded ad completion
    console.log('AdMob: Rewarded Ad simulated');
    return true;
  };

  const unlockPro = () => {
    setIsPro(true);
    console.log('AdMob: Pro unlocked');
  };

  const getBannerAdUnitId = () => ADMOB_CONFIG.bannerAdId;

  const shouldShowBannerAd = (index: number): boolean => {
    if (isPro) return false;
    if (Platform.OS === 'web') return false;
    return (index + 1) % 6 === 0 || (index + 1) % 10 === 0;
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
      }}
    >
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = () => {
  const context = useContext(AdMobContext);
  if (context === undefined) {
    throw new Error('useAdMob must be used within an AdMobProvider');
  }
  return context;
};
