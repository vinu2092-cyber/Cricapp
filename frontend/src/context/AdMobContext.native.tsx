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

// Production Ad IDs - Real AdMob IDs
const AD_IDS = {
  appOpen: 'ca-app-pub-9675798593675825/4826782503',      // Real App Open Ad ID
  interstitial: 'ca-app-pub-9675798593675825/8438724452', // Real Interstitial Ad ID
  banner: 'ca-app-pub-9675798593675825/8616886104',       // Real Banner Ad ID
  rewarded: 'ca-app-pub-9675798593675825/6702740458',     // Real Rewarded Ad ID
  native: 'ca-app-pub-3940256099942544/2247696110',       // Native Test ID (not used)
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
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ========== REWARDED AD: PRELOAD WITH TIMEOUT ==========
  const loadRewardedAd = useCallback(() => {
    if (loadingRef.current) {
      console.log('[AdMob] Rewarded: skip load, already loading');
      return;
    }
    if (rewardedRef.current) {
      console.log('[AdMob] Rewarded: skip load, ad already ready');
      return;
    }
    
    loadingRef.current = true;
    cleanupListeners();

    // CRITICAL: Timeout to prevent stuck loadingRef
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = setTimeout(() => {
      console.warn('[AdMob] Rewarded ad LOAD TIMEOUT (12s) - force resetting');
      loadingRef.current = false;
      cleanupListeners();
      if (retryRef.current < 8) {
        retryRef.current++;
        setTimeout(loadRewardedAd, 5000);
      } else {
        setTimeout(() => { retryRef.current = 0; loadRewardedAd(); }, 30000);
      }
    }, 12000);

    try {
      console.log('[AdMob] Rewarded: creating ad request with ID:', AD_IDS.rewarded);
      // NO requestNonPersonalizedAdsOnly - maximizes fill rate for rewarded ads
      // Keywords help AdMob match high-value sports/cricket ads
      const ad = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
        keywords: ['cricket', 'sports', 'live scores', 'gaming', 'entertainment'],
      });

      const unsub1 = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] Rewarded ad LOADED successfully!');
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        rewardedRef.current = ad;
        loadingRef.current = false;
        retryRef.current = 0;
        setIsRewardedAdReady(true);
      });

      const unsub2 = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] Rewarded ad ERROR:', error?.message || error?.code || JSON.stringify(error));
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        loadingRef.current = false;

        if (retryRef.current < 8) {
          retryRef.current++;
          const delay = 3000 * retryRef.current;
          console.log(`[AdMob] Rewarded ad retry ${retryRef.current}/8 in ${delay}ms`);
          setTimeout(loadRewardedAd, delay);
        } else {
          setTimeout(() => { retryRef.current = 0; loadRewardedAd(); }, 30000);
        }
      });

      unsubsRef.current = [unsub1, unsub2];
      console.log('[AdMob] Rewarded: calling ad.load()...');
      ad.load();
    } catch (err) {
      console.warn('[AdMob] Rewarded: EXCEPTION:', err);
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      loadingRef.current = false;
      if (retryRef.current < 8) {
        retryRef.current++;
        setTimeout(loadRewardedAd, 5000);
      }
    }
  }, []);

  // ========== SDK INIT ==========
  useEffect(() => {
    mobileAds()
      .setRequestConfiguration({
        testDeviceIdentifiers: [], // Production - no test devices
      })
      .then(() => mobileAds().initialize())
      .then((adapterStatuses) => {
        console.log('[AdMob] SDK initialized successfully');
        // Log adapter statuses to verify Unity Ads mediation is loaded
        if (adapterStatuses) {
          console.log('[AdMob] Adapter statuses:', JSON.stringify(adapterStatuses));
        }
        setIsAdMobInitialized(true);
        loadRewardedAd();
        loadInterstitialAd();
      })
      .catch((err) => {
        console.warn('[AdMob] SDK init failed:', err);
        setIsAdMobInitialized(true);
        setTimeout(loadRewardedAd, 2000);
        setTimeout(loadInterstitialAd, 3000);
      });

    // Periodic health check: ensure rewarded ad stays preloaded
    const healthCheck = setInterval(() => {
      // Force reset stuck loading state
      if (loadingRef.current) {
        console.log('[AdMob] Health check: loadingRef is stuck true, resetting...');
        loadingRef.current = false;
      }
      if (!rewardedRef.current) {
        console.log('[AdMob] Health check: no rewarded ad ready, preloading...');
        retryRef.current = 0;
        loadRewardedAd();
      }
      if (!interstitialRef.current && !interstitialLoadingRef.current && !isPro) {
        loadInterstitialAd();
      }
    }, 25000); // Check every 25 seconds

    return () => {
      cleanupListeners();
      cleanupInterstitialListeners();
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      clearInterval(healthCheck);
    };
  }, [loadRewardedAd, loadInterstitialAd]);

  // ========== APP OPEN AD ==========
  const showAppOpenAd = async (): Promise<void> => {
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

  // ========== REWARDED AD: SHOW (with ON-DEMAND FALLBACK + AUTO-RETRY) ==========
  const showRewardedAd = async (): Promise<boolean> => {
    // CASE 1: Pre-loaded ad is ready - show it immediately
    const preloadedAd = rewardedRef.current;
    if (preloadedAd) {
      console.log('[AdMob] Showing PRE-LOADED rewarded ad');
      return showRewardedAdInstance(preloadedAd, true);
    }

    // CASE 2: No pre-loaded ad - load ON-DEMAND with AUTO-RETRY (up to 3 attempts)
    console.log('[AdMob] No pre-loaded rewarded ad, trying ON-DEMAND with retries...');
    
    const tryLoadOnDemand = (attempt: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const attemptTimeout = setTimeout(() => {
          console.log(`[AdMob] On-demand attempt ${attempt}/3 TIMEOUT (10s)`);
          resolve(false); // Will trigger next attempt
        }, 10000);

        try {
          const onDemandAd = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
            keywords: ['cricket', 'sports', 'live scores', 'gaming', 'entertainment'],
          });

          let handled = false;

          onDemandAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
            if (handled) return;
            handled = true;
            console.log(`[AdMob] On-demand attempt ${attempt}/3 LOADED!`);
            clearTimeout(attemptTimeout);
            showRewardedAdInstance(onDemandAd, false).then(resolve);
          });

          onDemandAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
            if (handled) return;
            handled = true;
            console.warn(`[AdMob] On-demand attempt ${attempt}/3 ERROR:`, error?.message || error?.code || error);
            clearTimeout(attemptTimeout);
            resolve(false); // Will trigger next attempt
          });

          console.log(`[AdMob] On-demand attempt ${attempt}/3: loading...`);
          onDemandAd.load();
        } catch (err) {
          console.warn(`[AdMob] On-demand attempt ${attempt}/3 EXCEPTION:`, err);
          clearTimeout(attemptTimeout);
          resolve(false);
        }
      });
    };

    // Try up to 3 times with 2-second gaps
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await tryLoadOnDemand(attempt);
      if (result) return true; // Ad shown successfully
      
      if (attempt < 3) {
        console.log(`[AdMob] On-demand: waiting 2s before attempt ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // All 3 attempts failed
    console.warn('[AdMob] On-demand: all 3 attempts failed');
    Alert.alert(
      'Ad Not Available',
      'Rewarded ad is not available right now. This can happen with new apps. Please try again in a few minutes.',
    );
    // Keep preloading in background
    loadingRef.current = false;
    retryRef.current = 0;
    setTimeout(loadRewardedAd, 3000);
    return false;
  };

  // Helper: show a rewarded ad instance and track reward
  const showRewardedAdInstance = (ad: RewardedAd, isPreloaded: boolean): Promise<boolean> => {
    return new Promise((resolve) => {
      let rewarded = false;
      let done = false;
      const finish = (result: boolean) => {
        if (done) return;
        done = true;
        if (isPreloaded) {
          rewardedRef.current = null;
          setIsRewardedAdReady(false);
        }
        // Pre-load next ad in background
        loadingRef.current = false;
        retryRef.current = 0;
        setTimeout(loadRewardedAd, 500);
        resolve(result);
      };

      // Safety timeout: if nothing happens in 20s, assume failure
      const safetyTimeout = setTimeout(() => {
        console.log('[AdMob] Rewarded ad show SAFETY TIMEOUT');
        finish(rewarded);
      }, 20000);

      try {
        const u1 = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          console.log('[AdMob] Reward EARNED!');
          rewarded = true;
        });

        const u2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] Rewarded ad CLOSED, rewarded=', rewarded);
          try { u1(); } catch {}
          try { u2(); } catch {}
          clearTimeout(safetyTimeout);
          // Delay to let EARNED_REWARD fire if it hasn't
          setTimeout(() => finish(rewarded), 300);
        });

        ad.show();
      } catch (err) {
        console.warn('[AdMob] Rewarded ad show() failed:', err);
        clearTimeout(safetyTimeout);
        finish(false);
      }
    });
  };

  // ========== INTERSTITIAL AD ==========
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
