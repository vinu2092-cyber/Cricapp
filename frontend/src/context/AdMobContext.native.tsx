import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
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
  testDeviceId: '553c7721-4821-461b-9f62-8584b1e60745',
};

const PRO_ACCESS_DURATION = 30 * 60 * 1000;

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
  const { isPro, setProFromAdMob } = usePro();
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [targetClicks] = useState(Math.floor(Math.random() * 6) + 10);
  const rewardedRef = useRef<RewardedAd | null>(null);

  const loadRewardedAd = useCallback(() => {
    try {
      const ad = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId);
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('Rewarded Ad Loaded');
        rewardedRef.current = ad;
      });
      ad.load();
    } catch (error) {
      console.warn('Failed to load rewarded ad:', error);
    }
  }, []);

  useEffect(() => {
    mobileAds()
      .initialize()
      .then(() => {
        console.log('AdMob Initialized');
        setIsAdMobInitialized(true);
        loadRewardedAd();
      })
      .catch((err) => {
        console.warn('AdMob init failed:', err);
        setIsAdMobInitialized(true);
      });
  }, [loadRewardedAd]);

  const showAppOpenAd = async (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const appOpenAd = AppOpenAd.createForAdRequest(ADMOB_CONFIG.appOpenAdId);
        appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
          appOpenAd.show();
        });
        appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
          resolve();
        });
        appOpenAd.addAdEventListener(AdEventType.ERROR, () => {
          console.warn('App Open Ad error');
          resolve();
        });
        appOpenAd.load();
        // Timeout fallback
        setTimeout(resolve, 8000);
      } catch (error) {
        console.warn('App Open Ad failed:', error);
        resolve();
      }
    });
  };

  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!rewardedRef.current) {
        Alert.alert('Ad not ready', 'Please wait a few seconds and try again.');
        loadRewardedAd();
        resolve(false);
        return;
      }

      try {
        const earnedListener = rewardedRef.current.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          () => {
            resolve(true);
          }
        );

        const closeListener = rewardedRef.current.addAdEventListener(AdEventType.CLOSED, () => {
          earnedListener();
          closeListener();
          rewardedRef.current = null;
          loadRewardedAd();
        });

        rewardedRef.current.show();
      } catch (error) {
        console.warn('Rewarded ad show failed:', error);
        rewardedRef.current = null;
        loadRewardedAd();
        resolve(false);
      }
    });
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const interstitial = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId);
        interstitial.addAdEventListener(AdEventType.LOADED, () => {
          interstitial.show();
        });
        interstitial.addAdEventListener(AdEventType.CLOSED, () => {
          resolve(true);
        });
        interstitial.addAdEventListener(AdEventType.ERROR, () => {
          resolve(false);
        });
        interstitial.load();
        setTimeout(() => resolve(false), 10000);
      } catch (error) {
        console.warn('Interstitial failed:', error);
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

  const BannerAdComponent: React.FC<{ size?: string }> = () => (
    <BannerAd
      unitId={ADMOB_CONFIG.bannerAdId}
      size={BannerAdSize.BANNER}
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
