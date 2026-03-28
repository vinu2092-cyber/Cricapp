/**
 * Real AdMob Context for Expo SDK 52 + react-native-google-mobile-ads@14.11.0
 * Production-ready implementation with actual Google Mobile Ads SDK
 */
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Constants from 'expo-constants';

// Import Google Mobile Ads SDK
import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AppOpenAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// AdMob Configuration from app.json - Use your real Ad Unit IDs
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

// Real Banner Ad Component
const RealBannerAd: React.FC<{ size?: string }> = ({ size = 'BANNER' }) => {
  const getBannerSize = () => {
    switch (size) {
      case 'LARGE_BANNER':
        return BannerAdSize.LARGE_BANNER;
      case 'MEDIUM_RECTANGLE':
        return BannerAdSize.MEDIUM_RECTANGLE;
      case 'FULL_BANNER':
        return BannerAdSize.FULL_BANNER;
      case 'LEADERBOARD':
        return BannerAdSize.LEADERBOARD;
      default:
        return BannerAdSize.BANNER;
    }
  };

  return (
    <View style={styles.bannerContainer}>
      <BannerAd
        unitId={ADMOB_CONFIG.bannerAdId}
        size={getBannerSize()}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdLoaded={() => console.log('[AdMob] Banner ad loaded')}
        onAdFailedToLoad={(error) => console.log('[AdMob] Banner ad failed:', error)}
      />
    </View>
  );
};

// Create ad instances
let interstitialAd: InterstitialAd | null = null;
let rewardedAd: RewardedAd | null = null;
let appOpenAd: AppOpenAd | null = null;

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [clickThreshold, setClickThreshold] = useState(getRandomClickThreshold());
  const [rewardedAdsWatched, setRewardedAdsWatched] = useState(0);
  const proTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize AdMob SDK
  useEffect(() => {
    const initAdMob = async () => {
      try {
        // Configure test device
        await mobileAds().setRequestConfiguration({
          testDeviceIdentifiers: [ADMOB_CONFIG.testDeviceId],
        });

        // Initialize the SDK
        await mobileAds().initialize();
        console.log('[AdMob] SDK initialized successfully');
        setIsAdMobInitialized(true);

        // Preload ads
        loadInterstitialAd();
        loadRewardedAd();
        loadAppOpenAd();
      } catch (error) {
        console.error('[AdMob] Initialization error:', error);
        setIsAdMobInitialized(true); // Continue even if init fails
      }
    };

    initAdMob();

    return () => {
      if (proTimeoutRef.current) {
        clearTimeout(proTimeoutRef.current);
      }
    };
  }, []);

  // Load Interstitial Ad
  const loadInterstitialAd = () => {
    interstitialAd = InterstitialAd.createForAdRequest(ADMOB_CONFIG.interstitialAdId, {
      requestNonPersonalizedAdsOnly: false,
    });

    interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
      console.log('[AdMob] Interstitial ad loaded');
    });

    interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('[AdMob] Interstitial ad closed');
      loadInterstitialAd(); // Preload next ad
    });

    interstitialAd.load();
  };

  // Load Rewarded Ad
  const loadRewardedAd = () => {
    rewardedAd = RewardedAd.createForAdRequest(ADMOB_CONFIG.rewardedAdId, {
      requestNonPersonalizedAdsOnly: false,
    });

    rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('[AdMob] Rewarded ad loaded');
    });

    rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      console.log('[AdMob] User earned reward:', reward);
    });

    rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('[AdMob] Rewarded ad closed');
      loadRewardedAd(); // Preload next ad
    });

    rewardedAd.load();
  };

  // Load App Open Ad
  const loadAppOpenAd = () => {
    appOpenAd = AppOpenAd.createForAdRequest(ADMOB_CONFIG.appOpenAdId, {
      requestNonPersonalizedAdsOnly: false,
    });

    appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
      console.log('[AdMob] App open ad loaded');
    });

    appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('[AdMob] App open ad closed');
      loadAppOpenAd(); // Preload next ad
    });

    appOpenAd.load();
  };

  // Track clicks - show interstitial every 10-15 clicks ONLY for non-Pro users
  const trackClick = () => {
    if (isPro) {
      console.log('[AdMob] Pro user - skipping click-based ad');
      return;
    }

    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (newCount >= clickThreshold) {
      console.log(`[AdMob] Click threshold reached (${newCount}/${clickThreshold}), showing interstitial`);
      showInterstitialAd();
      setClickCount(0);
      setClickThreshold(getRandomClickThreshold());
    }
  };

  // Show interstitial ad
  const showInterstitialAd = async (): Promise<void> => {
    return new Promise((resolve) => {
      if (interstitialAd?.loaded) {
        interstitialAd.show();
        const unsubscribe = interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
          unsubscribe();
          resolve();
        });
      } else {
        console.log('[AdMob] Interstitial not loaded yet');
        loadInterstitialAd();
        resolve();
      }
    });
  };

  // Show rewarded ad - returns true if user watched the ad
  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (rewardedAd?.loaded) {
        let rewarded = false;

        const rewardListener = rewardedAd.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          () => {
            rewarded = true;
            const newCount = rewardedAdsWatched + 1;
            setRewardedAdsWatched(newCount);
            console.log(`[AdMob] Rewarded ad completed (${newCount}/3)`);

            // After 3 rewarded ads, unlock Pro for 30 minutes
            if (newCount >= 3) {
              console.log('[AdMob] 3 ads watched! Unlocking Pro for 30 minutes...');
              setIsPro(true);
              setRewardedAdsWatched(0);

              if (proTimeoutRef.current) {
                clearTimeout(proTimeoutRef.current);
              }

              proTimeoutRef.current = setTimeout(() => {
                console.log('[AdMob] Pro access expired');
                setIsPro(false);
              }, PRO_ACCESS_DURATION);
            }
          }
        );

        const closeListener = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
          rewardListener();
          closeListener();
          resolve(rewarded);
        });

        rewardedAd.show();
      } else {
        console.log('[AdMob] Rewarded ad not loaded yet');
        loadRewardedAd();
        resolve(false);
      }
    });
  };

  // Show app open ad
  const showAppOpenAd = async (): Promise<void> => {
    return new Promise((resolve) => {
      if (appOpenAd?.loaded) {
        appOpenAd.show();
        const unsubscribe = appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
          unsubscribe();
          resolve();
        });
      } else {
        console.log('[AdMob] App open ad not loaded yet');
        loadAppOpenAd();
        resolve();
      }
    });
  };

  // Manual Pro unlock trigger
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
    BannerAdComponent: RealBannerAd,
  };

  return <AdMobContext.Provider value={value}>{children}</AdMobContext.Provider>;
};

const styles = StyleSheet.create({
  bannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
});

export default AdMobProvider;
