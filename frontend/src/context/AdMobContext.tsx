import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import mobileAds, { 
  RewardedAd, 
  RewardedAdEventType, 
  InterstitialAd, 
  AdEventType,
  BannerAd, 
  BannerAdSize,
  TestIds
} from 'react-native-google-mobile-ads';

[span_3](start_span)// Production IDs from your configuration[span_3](end_span)
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-9675798593675825~2399929714',
  appOpenAdId: 'ca-app-pub-9675798593675825/4826782503',
  interstitialAdId: 'ca-app-pub-9675798593675825/8438724452',
  bannerAdId: 'ca-app-pub-9675798593675825/8616886104',
  rewardedAdId: 'ca-app-pub-9675798593675825/6702740458',
};

interface AdMobContextType {
  showRewardedAd: () => Promise<boolean>;
  showInterstitialAd: () => Promise<void>;
  BannerAdComponent: React.FC<{ size?: string }>;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [rewarded, setRewarded] = useState<RewardedAd | null>(null);

  useEffect(() => {
    // Initialize Mobile Ads for Native Platforms
    mobileAds().initialize().then(() => {
      console.log('AdMob Initialized');
      loadRewarded();
    });
  }, []);

  const loadRewarded = () => {
    const ad = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId);
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('Rewarded Ad Loaded');
      setRewarded(ad);
    });
    ad.load();
  };

  const showRewardedAd = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!rewarded) {
        console.log('Ad not ready, reloading...');
        loadRewarded();
        resolve(false);
        return;
      }

      const unsubscribeEarned = rewarded.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        (reward) => {
          console.log('User earned reward:', reward);
          resolve(true);
        }
      );

      const unsubscribeClosed = rewarded.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          unsubscribeEarned();
          unsubscribeClosed();
          loadRewarded(); // Reload for next time
          resolve(false); // If they didn't finish the ad, resolve false
        }
      );

      rewarded.show();
    });
  };

  const showInterstitialAd = async () => {
    const interstitial = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId);
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitial.show();
    });
    interstitial.load();
  };

  const BannerAdComponent: React.FC<{ size?: string }> = () => (
    <BannerAd
      unitId={ADMOB_CONFIG.bannerAdId}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );

  return (
    <AdMobContext.Provider value={{ showRewardedAd, showInterstitialAd, BannerAdComponent }}>
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = () => {
  const context = useContext(AdMobContext);
  if (!context) throw new Error('useAdMob must be used within AdMobProvider');
  return context;
};

export default AdMobProvider;
