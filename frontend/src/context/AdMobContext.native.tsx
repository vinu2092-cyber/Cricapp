import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  setIsPro: (value: boolean) => void;
  adCount: number;
  setAdCount: React.Dispatch<React.SetStateAction<number>>;
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  isRewardedAdReady: boolean;
  BannerAdComponent: React.FC;
  handleUnlockClick: () => void;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isPro: globalIsPro, setProFromAdMob } = usePro();
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isRewardedAdReady, setIsRewardedAdReady] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [clickTarget] = useState(Math.floor(Math.random() * 6) + 10);
  const [adCount, setAdCount] = useState(0);
  const [isPro, setIsPro] = useState(false);

  const rewardedRef = useRef<RewardedAd | null>(null);
  const loadingRef = useRef(false);
  const retryRef = useRef(0);
  const unsubsRef = useRef<(() => void)[]>([]);

  // Check Pro expiry on mount
  useEffect(() => {
    const checkProExpiry = async () => {
      try {
        const expiry = await AsyncStorage.getItem('pro_expiry');
        if (expiry) {
          const expiryTime = parseInt(expiry, 10);
          if (Date.now() < expiryTime) {
            setIsPro(true);
            setProFromAdMob(true);
          } else {
            await AsyncStorage.removeItem('pro_expiry');
            setIsPro(false);
            setProFromAdMob(false);
          }
        }
      } catch {}
    };
    checkProExpiry();
  }, []);

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

  // Initialize AdMob with test device config + load rewarded ad on mount
  useEffect(() => {
    mobileAds()
      .setRequestConfiguration({
        testDeviceIdentifiers: ['553c7721-4821-461b-9f62-8584b1e60745']
      })
      .then(() => mobileAds().initialize())
      .then(() => {
        console.log('[AdMob] SDK initialized with test device');
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

  // Target 1: EARNED_REWARD listener - increment counter, unlock Pro at 3
  useEffect(() => {
    if (!rewardedRef.current) return;
    const unsubscribeEarned = rewardedRef.current.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        setAdCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setIsPro(true);
            setProFromAdMob(true);
            AsyncStorage.setItem('pro_expiry', (Date.now() + 30 * 60 * 1000).toString());
            return 0;
          }
          return newCount;
        });
        loadRewardedAd(); // Immediately load next
      }
    );
    return () => unsubscribeEarned();
  }, [rewardedRef.current]);

  // handleUnlockClick - force load if not ready
  const handleUnlockClick = useCallback(() => {
    if (rewardedRef.current && isRewardedAdReady) {
      rewardedRef.current.show();
    } else {
      loadRewardedAd(); // Force load if not ready
    }
  }, [isRewardedAdReady, loadRewardedAd]);

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
          
          // Increment ad count and check for Pro unlock
          setAdCount((prev) => {
            const newCount = prev + 1;
            if (newCount >= 3) {
              setIsPro(true);
              setProFromAdMob(true);
              AsyncStorage.setItem('pro_expiry', (Date.now() + 30 * 60 * 1000).toString());
              return 0; // reset counter
            }
            return newCount;
          });
          loadRewardedAd(); // Load next ad immediately
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

  // Target 2: Random 10-15 Clicks Interstitial Ad
  const trackClick = useCallback(() => {
    if (isPro || globalIsPro) return;
    const next = clicks + 1;
    const randomTarget = Math.floor(Math.random() * 6) + 10; // random(10, 15)
    if (next >= randomTarget) {
      setClicks(0);
      showInterstitialAd();
    } else {
      setClicks(next);
    }
  }, [clicks, isPro, globalIsPro]);

  const BannerAdComponent: React.FC = () => (
    <BannerAd
      unitId={AD_IDS.banner}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );

  return (
    <AdMobContext.Provider value={{
      isAdMobInitialized, isPro: isPro || globalIsPro, setIsPro, adCount, setAdCount, trackClick,
      showAppOpenAd, showInterstitialAd, showRewardedAd, isRewardedAdReady,
      BannerAdComponent, handleUnlockClick,
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
