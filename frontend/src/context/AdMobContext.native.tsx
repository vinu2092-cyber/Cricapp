import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  AppOpenAd,
  TestIds,
} from 'react-native-google-mobile-ads';
import { usePro } from './ProContext';

// Production IDs
const AD_IDS = {
  appOpen: 'ca-app-pub-9675798593675825/4826782503',
  interstitial: 'ca-app-pub-9675798593675825/8438724452',
  banner: 'ca-app-pub-9675798593675825/8616886104',
  rewarded: 'ca-app-pub-9675798593675825/6702740458',
};

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  isRewardedAdReady: boolean;
  BannerAdComponent: React.FC;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isPro } = usePro();
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isRewardedAdReady, setIsRewardedAdReady] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [clickTarget] = useState(Math.floor(Math.random() * 6) + 10);

  const rewardedRef = useRef<RewardedAd | null>(null);
  const loadingRef = useRef(false);
  const retryRef = useRef(0);
  const unsubsRef = useRef<(() => void)[]>([]);

  // Cleanup event listeners
  const cleanupListeners = () => {
    unsubsRef.current.forEach(u => { try { u(); } catch {} });
    unsubsRef.current = [];
  };

  const loadRewardedAd = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsRewardedAdReady(false);
    cleanupListeners();

    try {
      const ad = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
        requestNonPersonalizedAdsOnly: true,
      });

      const unsub1 = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] Rewarded ad LOADED');
        rewardedRef.current = ad;
        loadingRef.current = false;
        retryRef.current = 0;
        setIsRewardedAdReady(true);
      });

      const unsub2 = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] Rewarded ad error:', error?.message || error);
        loadingRef.current = false;
        setIsRewardedAdReady(false);

        if (retryRef.current < 5) {
          retryRef.current++;
          const delay = Math.min(3000 * Math.pow(2, retryRef.current), 30000);
          setTimeout(loadRewardedAd, delay);
        }
      });

      unsubsRef.current = [unsub1, unsub2];
      ad.load();
    } catch (err) {
      console.warn('[AdMob] Failed to create rewarded ad:', err);
      loadingRef.current = false;
      if (retryRef.current < 5) {
        retryRef.current++;
        setTimeout(loadRewardedAd, 5000);
      }
    }
  }, []);

  useEffect(() => {
    mobileAds()
      .initialize()
      .then(() => {
        console.log('[AdMob] SDK initialized');
        setIsAdMobInitialized(true);
        loadRewardedAd();
      })
      .catch((err) => {
        console.warn('[AdMob] SDK init failed:', err);
        setIsAdMobInitialized(true);
        setTimeout(loadRewardedAd, 2000);
      });

    return cleanupListeners;
  }, [loadRewardedAd]);

  const showAppOpenAd = async (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen);
        const timeout = setTimeout(resolve, 6000);
        ad.addAdEventListener(AdEventType.LOADED, () => ad.show());
        ad.addAdEventListener(AdEventType.CLOSED, () => { clearTimeout(timeout); resolve(); });
        ad.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(timeout); resolve(); });
        ad.load();
      } catch { resolve(); }
    });
  };

  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      const ad = rewardedRef.current;
      if (!ad) {
        loadRewardedAd();
        Alert.alert('Loading Ad', 'Ad is being prepared. Please try again in a few seconds.');
        resolve(false);
        return;
      }

      let rewarded = false;
      let done = false;
      const finish = (result: boolean) => {
        if (done) return;
        done = true;
        rewardedRef.current = null;
        setIsRewardedAdReady(false);
        // Pre-load next ad
        setTimeout(loadRewardedAd, 500);
        resolve(result);
      };

      // Safety timeout: if nothing happens in 15s, assume failure
      const safetyTimeout = setTimeout(() => finish(rewarded), 15000);

      try {
        const u1 = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          console.log('[AdMob] Reward EARNED');
          rewarded = true;
        });

        const u2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] Ad CLOSED, rewarded=', rewarded);
          u1(); u2();
          clearTimeout(safetyTimeout);
          // Delay to let EARNED_REWARD fire if it hasn't
          setTimeout(() => finish(rewarded), 300);
        });

        ad.show();
      } catch (err) {
        console.warn('[AdMob] show() failed:', err);
        clearTimeout(safetyTimeout);
        finish(false);
      }
    });
  };

  const showInterstitialAd = async (): Promise<boolean> => {
    if (isPro) return false;
    return new Promise((resolve) => {
      try {
        const ad = InterstitialAd.createForAdRequest(AD_IDS.interstitial);
        const timeout = setTimeout(() => resolve(false), 10000);
        ad.addAdEventListener(AdEventType.LOADED, () => ad.show());
        ad.addAdEventListener(AdEventType.CLOSED, () => { clearTimeout(timeout); resolve(true); });
        ad.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(timeout); resolve(false); });
        ad.load();
      } catch { resolve(false); }
    });
  };

  const trackClick = () => {
    if (isPro) return;
    const next = clicks + 1;
    if (next >= clickTarget) {
      setClicks(0);
      showInterstitialAd();
    } else {
      setClicks(next);
    }
  };

  const BannerAdComponent: React.FC = () => (
    <BannerAd
      unitId={AD_IDS.banner}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );

  return (
    <AdMobContext.Provider value={{
      isAdMobInitialized, isPro, trackClick,
      showAppOpenAd, showInterstitialAd, showRewardedAd, isRewardedAdReady,
      BannerAdComponent,
    }}>
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = (): AdMobContextType => {
  const ctx = useContext(AdMobContext);
  if (!ctx) throw new Error('useAdMob must be inside AdMobProvider');
  return ctx;
};

export default AdMobProvider;
