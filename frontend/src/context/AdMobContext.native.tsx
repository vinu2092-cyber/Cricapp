import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';

export const ADMOB_CONFIG = {
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
};

const PRO_ACCESS_DURATION = 30 * 60 * 1000;

interface AdMobContextType {
  isPro: boolean;
  trackClick: () => void;
  showInterstitialAd: () => Promise<void>;
  showRewardedAd: () => Promise<boolean>;
  BannerAdComponent: React.FC<{ size?: string }>;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [rewardedAdsWatched, setRewardedAdsWatched] = useState(0);
  const rewardedRef = useRef<RewardedAd | null>(null);
  const proTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadRewardedAd = useCallback(() => {
    const ad = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId);
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('Rewarded Loaded');
      rewardedRef.current = ad;
    });
    ad.load();
  }, []);

  useEffect(() => {
    mobileAds().initialize().then(() => {
      loadRewardedAd();
    });
    return () => {
      if (proTimeoutRef.current) clearTimeout(proTimeoutRef.current);
    };
  }, [loadRewardedAd]);

  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!rewardedRef.current) {
        Alert.alert("Ad not ready", "Please wait a few seconds and try again.");
        loadRewardedAd();
        resolve(false);
        return;
      }

      const earnedListener = rewardedRef.current.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          const newCount = rewardedAdsWatched + 1;
          setRewardedAdsWatched(newCount);
          if (newCount >= 3) {
            setIsPro(true);
            setRewardedAdsWatched(0);
            if (proTimeoutRef.current) clearTimeout(proTimeoutRef.current);
            proTimeoutRef.current = setTimeout(() => setIsPro(false), PRO_ACCESS_DURATION);
          }
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
    });
  };

  const showInterstitialAd = async () => {
    const interstitial = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId);
    interstitial.addAdEventListener(AdEventType.LOADED, () => interstitial.show());
    interstitial.load();
  };

  const trackClick = () => {
    if (isPro) return;
    const newCount = clickCount + 1;
    if (newCount >= 12) { // Logic B: 10-15 click average
      showInterstitialAd();
      setClickCount(0);
    } else {
      setClickCount(newCount);
    }
  };

  return (
    <AdMobContext.Provider value={{ 
      isPro, 
      trackClick, 
      showInterstitialAd, 
      showRewardedAd, 
      BannerAdComponent: ({size}) => <BannerAd unitId={ADMOB_CONFIG.bannerAdId} size={BannerAdSize.BANNER} /> 
    }}>
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = () => {
  const context = useContext(AdMobContext);
  if (!context) throw new Error('useAdMob missing');
  return context;
};

export default AdMobProvider;
