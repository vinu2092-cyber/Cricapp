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
  rewarded: 'ca-app-pub-9675798593675825/6702704058',     // Real Rewarded Ad ID
  native: 'ca-app-pub-3940256099942544/2247696110',       // Native Test ID (not used)
};

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  prepareInterstitialAd: () => void; // v1.0.15: lazy preload trigger
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
  const appOpenRef = useRef<AppOpenAd | null>(null);
  const loadingRef = useRef(false);
  const interstitialLoadingRef = useRef(false);
  const appOpenLoadingRef = useRef(false);
  const retryRef = useRef(0);
  // v1.0.15 — request-waste optimisation refs
  const appOpenShownRef = useRef(false);          // show only once per app launch
  const appOpenRetryRef = useRef(0);              // cap App Open retries (max 2)
  const interstitialRetryRef = useRef(0);         // cap Interstitial preload retries (max 2)
  const unsubsRef = useRef<(() => void)[]>([]);
  const interstitialUnsubsRef = useRef<(() => void)[]>([]);
  const appOpenUnsubsRef = useRef<(() => void)[]>([]);

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
  // ============ APP OPEN AD PRELOAD ============
  // v1.0.15: Show only ONCE per app launch. After CLOSED, do NOT preload
  // again (no "next" App Open in the same session). On error, cap retries
  // at 2 with 30s/60s back-off so we don't spam wasted requests.
  const loadAppOpenAd = useCallback(() => {
    if (appOpenLoadingRef.current || isPro) return;
    if (appOpenShownRef.current) return; // Already shown once this session — no more requests
    if (appOpenRef.current) return;       // Already preloaded
    appOpenLoadingRef.current = true;

    try {
      console.log('[AdMob] Preloading App Open Ad (once per session)...');
      const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen, {
        requestNonPersonalizedAdsOnly: false,
      });
      appOpenRef.current = ad;

      // Cleanup old listeners
      appOpenUnsubsRef.current.forEach(unsub => unsub());
      appOpenUnsubsRef.current = [];

      const unsub1 = ad.addAdEventListener(AdEventType.LOADED, () => {
        console.log('[AdMob] ✅ App Open Ad PRELOADED and READY');
        appOpenLoadingRef.current = false;
        appOpenRetryRef.current = 0;
      });

      const unsub2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] App Open Ad closed — NOT reloading (one per session)');
        appOpenRef.current = null;
        appOpenLoadingRef.current = false;
        appOpenShownRef.current = true; // Lock — no more App Open requests this session
      });

      const unsub3 = ad.addAdEventListener(AdEventType.ERROR, (error) => {
        console.warn('[AdMob] App Open preload error:', error?.message || error);
        appOpenRef.current = null;
        appOpenLoadingRef.current = false;
        // Cap retries at 2 with longer back-off to avoid request waste
        if (appOpenRetryRef.current < 2) {
          appOpenRetryRef.current++;
          const delay = 30000 * appOpenRetryRef.current; // 30s, 60s
          setTimeout(loadAppOpenAd, delay);
        } else {
          console.log('[AdMob] App Open retries exhausted — giving up for this session');
        }
      });

      appOpenUnsubsRef.current = [unsub1, unsub2, unsub3];
      ad.load();
    } catch (err) {
      console.warn('[AdMob] Failed to preload App Open Ad:', err);
      appOpenLoadingRef.current = false;
    }
  }, [isPro]);

  // ============ INTERSTITIAL AD PRELOAD ============
  // v1.0.15: Reduce request waste — keep ONE preloaded interstitial. After
  // it shows (CLOSED) we do NOT auto-reload; trackClick() lazily triggers
  // the next preload only when click count is within 3 of the target so we
  // don't burn fresh requests for clicks that may never happen. Error
  // retries capped at 2.
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
        interstitialRetryRef.current = 0;
      });

      const unsub2 = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] Interstitial preload error:', error?.message || error);
        interstitialLoadingRef.current = false;
        // Cap retries at 2 with longer back-off
        if (interstitialRetryRef.current < 2) {
          interstitialRetryRef.current++;
          const delay = 30000 * interstitialRetryRef.current; // 30s, 60s
          setTimeout(loadInterstitialAd, delay);
        } else {
          console.log('[AdMob] Interstitial retries exhausted — will lazy-load on next trackClick');
        }
      });

      const unsub3 = ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Interstitial CLOSED — NOT auto-reloading (lazy on next click target)');
        interstitialRef.current = null;
        interstitialLoadingRef.current = false;
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
        testDeviceIdentifiers: [], // Production - no test devices
      })
      .then(() => mobileAds().initialize())
      .then(() => {
        console.log('[AdMob] SDK initialized');
        setIsAdMobInitialized(true);
        // v1.0.15: Preload Rewarded (Pro modal expectation) and AppOpen
        // (shown right after splash). Interstitial is now LAZY — loaded
        // only when click counter approaches threshold (see trackClick).
        loadRewardedAd();
        loadAppOpenAd();
      })
      .catch((err) => {
        console.warn('[AdMob] SDK init failed:', err);
        setIsAdMobInitialized(true);
        setTimeout(loadRewardedAd, 2000);
        setTimeout(loadAppOpenAd, 4000);
      });

    return () => {
      cleanupListeners();
      cleanupInterstitialListeners();
    };
  }, [loadRewardedAd, loadInterstitialAd, loadAppOpenAd]);

  const showAppOpenAd = async (): Promise<void> => {
    // Skip for Pro users
    if (isPro) {
      console.log('[AdMob] Pro user - skipping App Open Ad');
      return Promise.resolve();
    }
    
    console.log('[AdMob] showAppOpenAd called, preloaded ad available:', !!appOpenRef.current);
    
    // If preloaded ad available, show immediately
    if (appOpenRef.current) {
      try {
        console.log('[AdMob] Showing preloaded App Open Ad...');
        await appOpenRef.current.show();
        return Promise.resolve();
      } catch (err) {
        console.log('[AdMob] App Open show error:', err);
        appOpenRef.current = null;
        loadAppOpenAd(); // Reload for next time
        return Promise.resolve();
      }
    }
    
    // No preloaded ad - trigger preload for next time
    console.log('[AdMob] No preloaded App Open Ad, loading for next time...');
    loadAppOpenAd();
    return Promise.resolve();
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
    // v1.0.15: Lazy-prepare interstitial only when we're 3 clicks away
    // from the target. Avoids preloading at app start for users who never
    // reach the threshold (saves wasted requests).
    if (next >= clickTarget - 3 && !interstitialRef.current && !interstitialLoadingRef.current) {
      loadInterstitialAd();
    }
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
      prepareInterstitialAd: loadInterstitialAd,
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
