import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { Alert, Platform, View } from 'react-native';
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

// Google Official Test Ad IDs (for testing/development)
const AD_IDS = {
  appOpen: 'ca-app-pub-3940256099942544/9257395921',      // CORRECT App Open Test ID
  interstitial: 'ca-app-pub-3940256099942544/1033173712', // Interstitial Test ID
  banner: 'ca-app-pub-3940256099942544/6300978111',       // Banner Test ID
  rewarded: 'ca-app-pub-3940256099942544/5224354917',     // Rewarded Test ID
  native: 'ca-app-pub-3940256099942544/2247696110',       // Native Test ID
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
  const interstitialRef = useRef<InterstitialAd | null>(null);
  const loadingRef = useRef(false);
  const interstitialLoadingRef = useRef(false);
  const retryRef = useRef(0);
  const unsubsRef = useRef<(() => void)[]>([]);
  const interstitialUnsubsRef = useRef<(() => void)[]>([]);

  // Cleanup event listeners
  const cleanupListeners = () => {
    unsubsRef.current.forEach(u => { try { u(); } catch {} });
    unsubsRef.current = [];
  };

  const cleanupInterstitialListeners = () => {
    interstitialUnsubsRef.current.forEach(u => { try { u(); } catch {} });
    interstitialUnsubsRef.current = [];
  };

  // Pre-load interstitial ad so it shows instantly on click threshold
  const loadInterstitialAd = useCallback(() => {
    if (interstitialLoadingRef.current) return;
    if (interstitialRef.current) return; // Already have one ready
    if (isPro) return; // Pro users don't need interstitials

    interstitialLoadingRef.current = true;
    cleanupInterstitialListeners();

    try {
      const ad = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {
        requestNonPersonalizedAdsOnly: true,
      });

      const unsub1 = ad.addAdEventListener(AdEventType.LOADED, () => {
        console.log('[AdMob] Interstitial ad PRE-LOADED');
        interstitialRef.current = ad;
        interstitialLoadingRef.current = false;
      });

      const unsub2 = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] Interstitial preload error:', error?.message || error);
        interstitialLoadingRef.current = false;
        // Retry after 10s
        setTimeout(loadInterstitialAd, 10000);
      });

      const unsub3 = ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Interstitial CLOSED, pre-loading next');
        interstitialRef.current = null;
        interstitialLoadingRef.current = false;
        // Pre-load next interstitial after this one closes
        setTimeout(loadInterstitialAd, 1000);
      });

      interstitialUnsubsRef.current = [unsub1, unsub2, unsub3];
      ad.load();
    } catch (err) {
      console.warn('[AdMob] Failed to create interstitial ad:', err);
      interstitialLoadingRef.current = false;
    }
  }, [isPro]);

  const loadRewardedAd = useCallback(() => {
    if (loadingRef.current) return;
    if (rewardedRef.current) return; // Already have an ad ready
    
    loadingRef.current = true;
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

        if (retryRef.current < 3) {
          retryRef.current++;
          const delay = 5000 * retryRef.current; // 5s, 10s, 15s
          setTimeout(loadRewardedAd, delay);
        }
      });

      unsubsRef.current = [unsub1, unsub2];
      ad.load();
    } catch (err) {
      console.warn('[AdMob] Failed to create rewarded ad:', err);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mobileAds()
      .setRequestConfiguration({
        testDeviceIdentifiers: ['553c7721-4821-461b-9f62-8584b1e60745'],
      })
      .then(() => mobileAds().initialize())
      .then(() => {
        console.log('[AdMob] SDK initialized');
        setIsAdMobInitialized(true);
        loadRewardedAd();
        loadInterstitialAd(); // Pre-load interstitial for non-pro users
      })
      .catch((err) => {
        console.warn('[AdMob] SDK init failed:', err);
        setIsAdMobInitialized(true);
        setTimeout(loadRewardedAd, 2000);
        setTimeout(loadInterstitialAd, 3000);
      });

    return () => {
      cleanupListeners();
      cleanupInterstitialListeners();
    };
  }, [loadRewardedAd, loadInterstitialAd]);

  const showAppOpenAd = async (): Promise<void> => {
    // Skip for Pro users
    if (isPro) {
      console.log('[AdMob] Pro user - skipping App Open Ad');
      return Promise.resolve();
    }
    
    console.log('[AdMob] showAppOpenAd called, SDK initialized:', isAdMobInitialized);
    return new Promise((resolve) => {
      try {
        console.log('[AdMob] Creating App Open Ad with ID:', AD_IDS.appOpen);
        const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen, {
          requestNonPersonalizedAdsOnly: true,
        });
        
        // Increased timeout to 15 seconds for slow networks
        const timeout = setTimeout(() => {
          console.log('[AdMob] App Open Ad timeout after 15s');
          resolve();
        }, 15000);
        
        ad.addAdEventListener(AdEventType.LOADED, () => {
          console.log('[AdMob] App Open Ad LOADED, showing now...');
          try {
            ad.show();
          } catch (showErr) {
            console.log('[AdMob] App Open Ad show error:', showErr);
            clearTimeout(timeout);
            resolve();
          }
        });
        
        ad.addAdEventListener(AdEventType.OPENED, () => {
          console.log('[AdMob] App Open Ad OPENED (visible to user)');
        });
        
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] App Open Ad CLOSED by user');
          clearTimeout(timeout);
          resolve();
        });
        
        ad.addAdEventListener(AdEventType.ERROR, (error) => {
          console.log('[AdMob] App Open Ad ERROR:', error?.message || error);
          clearTimeout(timeout);
          resolve();
        });
        
        console.log('[AdMob] Loading App Open Ad...');
        ad.load();
      } catch (err) {
        console.log('[AdMob] App Open Ad exception:', err);
        resolve();
      }
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
    
    // Use pre-loaded interstitial ad for instant display
    const ad = interstitialRef.current;
    if (ad) {
      return new Promise((resolve) => {
        try {
          console.log('[AdMob] Showing PRE-LOADED interstitial');
          interstitialRef.current = null; // Clear ref, CLOSED listener will reload next
          ad.show();
          resolve(true);
        } catch (err) {
          console.warn('[AdMob] Interstitial show() failed:', err);
          interstitialRef.current = null;
          interstitialLoadingRef.current = false;
          setTimeout(loadInterstitialAd, 1000);
          resolve(false);
        }
      });
    }

    // Fallback: create and load on-demand if pre-loaded ad not available
    console.log('[AdMob] No pre-loaded interstitial, loading on-demand...');
    loadInterstitialAd(); // Start pre-loading for next time
    return new Promise((resolve) => {
      try {
        const fallbackAd = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {
          requestNonPersonalizedAdsOnly: true,
        });
        const timeout = setTimeout(() => resolve(false), 10000);
        fallbackAd.addAdEventListener(AdEventType.LOADED, () => fallbackAd.show());
        fallbackAd.addAdEventListener(AdEventType.CLOSED, () => { clearTimeout(timeout); resolve(true); });
        fallbackAd.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(timeout); resolve(false); });
        fallbackAd.load();
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

  const BannerAdComponent: React.FC = () => {
    try {
      return (
        <View style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center', marginVertical: 10, width: '100%' }}>
          <BannerAd
            unitId={AD_IDS.banner}
            size={BannerAdSize.BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdFailedToLoad={(error) => console.log('[AdMob] Banner failed:', error)}
          />
        </View>
      );
    } catch (error) {
      console.warn('[AdMob] BannerAd render error:', error);
      return null;
    }
  };

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
