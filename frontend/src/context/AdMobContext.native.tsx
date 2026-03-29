import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  AppOpenAd,
} from 'react-native-google-mobile-ads';
import { usePro } from './ProContext';

export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
};

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  clickCount: number;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  isRewardedAdReady: boolean;
  BannerAdComponent: React.FC<{ size?: string }>;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isPro, setProFromAdMob } = usePro();
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [targetClicks] = useState(Math.floor(Math.random() * 6) + 10);
  const [isRewardedAdReady, setIsRewardedAdReady] = useState(false);
  const rewardedAdRef = useRef<RewardedAd | null>(null);
  const isLoadingRef = useRef(false);
  const retryCountRef = useRef(0);

  const loadRewardedAd = useCallback(() => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsRewardedAdReady(false);

    try {
      const ad = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId, {
        requestNonPersonalizedAdsOnly: true,
      });

      const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        rewardedAdRef.current = ad;
        isLoadingRef.current = false;
        retryCountRef.current = 0;
        setIsRewardedAdReady(true);
      });

      const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('Rewarded ad load error:', error?.message || error);
        isLoadingRef.current = false;
        setIsRewardedAdReady(false);

        // Retry with backoff
        if (retryCountRef.current < 6) {
          retryCountRef.current += 1;
          const delay = Math.min(3000 * Math.pow(1.5, retryCountRef.current), 30000);
          setTimeout(() => loadRewardedAd(), delay);
        }
      });

      ad.load();
    } catch (error) {
      console.warn('Failed to create rewarded ad:', error);
      isLoadingRef.current = false;

      if (retryCountRef.current < 6) {
        retryCountRef.current += 1;
        setTimeout(() => loadRewardedAd(), 5000);
      }
    }
  }, []);

  useEffect(() => {
    mobileAds()
      .initialize()
      .then(() => {
        setIsAdMobInitialized(true);
        loadRewardedAd();
      })
      .catch((err) => {
        console.warn('AdMob init failed:', err);
        setIsAdMobInitialized(true);
        setTimeout(() => loadRewardedAd(), 2000);
      });
  }, [loadRewardedAd]);

  const showAppOpenAd = async (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const appOpenAd = AppOpenAd.createForAdRequest(ADMOB_CONFIG.appOpenAdId);
        const timeout = setTimeout(resolve, 8000);
        appOpenAd.addAdEventListener(AdEventType.LOADED, () => appOpenAd.show());
        appOpenAd.addAdEventListener(AdEventType.CLOSED, () => { clearTimeout(timeout); resolve(); });
        appOpenAd.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(timeout); resolve(); });
        appOpenAd.load();
      } catch {
        resolve();
      }
    });
  };

  // Rewarded ad - properly tracks earned reward before resolving
  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!rewardedAdRef.current) {
        // Not ready - start loading and tell user to wait
        loadRewardedAd();
        Alert.alert(
          'Ad Loading',
          'Ad is being loaded. Please try again in a few seconds.',
          [{ text: 'OK' }]
        );
        resolve(false);
        return;
      }

      const ad = rewardedAdRef.current;
      let userEarnedReward = false;
      let adClosed = false;
      let resolved = false;

      const safeResolve = (value: boolean) => {
        if (resolved) return;
        resolved = true;
        // Reset and pre-load next ad
        rewardedAdRef.current = null;
        setIsRewardedAdReady(false);
        loadRewardedAd();
        resolve(value);
      };

      // Listen for reward earned (fires BEFORE close usually)
      const unsubEarned = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          userEarnedReward = true;
          // If ad already closed, resolve now
          if (adClosed) {
            unsubEarned();
            safeResolve(true);
          }
        }
      );

      // Listen for ad close
      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        adClosed = true;
        unsubClosed();

        // Give EARNED_REWARD a moment to fire if it hasn't yet
        setTimeout(() => {
          unsubEarned();
          safeResolve(userEarnedReward);
        }, 500);
      });

      // Error handling
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
        unsubEarned();
        unsubClosed();
        unsubError();
        safeResolve(false);
      });

      try {
        ad.show();
      } catch (err) {
        console.warn('Rewarded ad show failed:', err);
        unsubEarned();
        unsubClosed();
        unsubError();
        safeResolve(false);
      }
    });
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const interstitial = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId);
        const timeout = setTimeout(() => resolve(false), 10000);
        interstitial.addAdEventListener(AdEventType.LOADED, () => interstitial.show());
        interstitial.addAdEventListener(AdEventType.CLOSED, () => { clearTimeout(timeout); resolve(true); });
        interstitial.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(timeout); resolve(false); });
        interstitial.load();
      } catch {
        resolve(false);
      }
    });
  };

  const trackClick = () => {
    if (isPro) return;
    const newCount = clickCount + 1;
    if (newCount >= targetClicks) {
      showInterstitialAd();
      setClickCount(0);
    } else {
      setClickCount(newCount);
    }
  };

  const BannerAdComponent: React.FC<{ size?: string }> = ({ size }) => (
    <BannerAd
      unitId={ADMOB_CONFIG.bannerAdId}
      size={size === 'LARGE_BANNER' ? BannerAdSize.LARGE_BANNER : BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
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
        isRewardedAdReady,
        BannerAdComponent,
      }}
    >
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

export default AdMobProvider;
