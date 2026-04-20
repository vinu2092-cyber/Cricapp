import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';
import mobileAds, {
  AdsConsent,
  AdsConsentStatus,
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  AppOpenAd,
} from 'react-native-google-mobile-ads';
import { usePro } from './ProContext';

// Production Ad IDs - Real AdMob IDs
const AD_IDS = {
  appOpen: 'ca-app-pub-9675798593675825/4826782503',
  interstitial: 'ca-app-pub-9675798593675825/8438724452',
  banner: 'ca-app-pub-9675798593675825/8616886104',
  rewarded: 'ca-app-pub-9675798593675825/6702704058',
};

// Track if SDK is initialized (for load gating)
let sdkInitialized = false;

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  showPrivacyOptionsForm: () => Promise<void>;
  isRewardedAdReady: boolean;
  BannerAdComponent: React.FC;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isPro } = usePro();
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isRewardedAdReady, setIsRewardedAdReady] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [clickTarget] = useState(Math.floor(Math.random() * 21) + 40);

  // Interstitial refs (keep existing working pattern)
  const interstitialRef = useRef<InterstitialAd | null>(null);
  const interstitialLoadingRef = useRef(false);
  const interstitialUnsubsRef = useRef<(() => void)[]>([]);

  // Rewarded ad refs - using ref instead of module-level variable
  // so listeners can be properly re-registered after each ad close
  const rewardResolverRef = useRef<((result: boolean) => void) | null>(null);
  const rewardEarnedRef = useRef(false);
  const rewardedAdRef = useRef<ReturnType<typeof RewardedAd.createForAdRequest> | null>(null);
  const rewardedListenersRef = useRef<(() => void)[]>([]);

  // App Open ad preload refs. A single preloaded instance lives here ready to
  // be shown at the next cold-start or resume. On CLOSED/ERROR we refill.
  const appOpenAdRef = useRef<ReturnType<typeof AppOpenAd.createForAdRequest> | null>(null);
  const appOpenLoadingRef = useRef(false);
  const appOpenReadyRef = useRef(false);
  const appOpenUnsubsRef = useRef<(() => void)[]>([]);

  const cleanupAppOpenListeners = () => {
    appOpenUnsubsRef.current.forEach(u => { try { u(); } catch {} });
    appOpenUnsubsRef.current = [];
  };

  const cleanupInterstitialListeners = () => {
    interstitialUnsubsRef.current.forEach(u => { try { u(); } catch {} });
    interstitialUnsubsRef.current = [];
  };

  const cleanupRewardedListeners = () => {
    rewardedListenersRef.current.forEach(u => { try { u(); } catch {} });
    rewardedListenersRef.current = [];
  };

  // Pre-load interstitial ad (existing working pattern - untouched)
  const loadInterstitialAd = useCallback(() => {
    if (interstitialLoadingRef.current) return;
    if (interstitialRef.current) return;
    if (isPro) return;

    interstitialLoadingRef.current = true;
    cleanupInterstitialListeners();

    try {
      const ad = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {});

      const unsub1 = ad.addAdEventListener(AdEventType.LOADED, () => {
        console.log('[AdMob] Interstitial ad PRE-LOADED');
        interstitialRef.current = ad;
        interstitialLoadingRef.current = false;
      });

      const unsub2 = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] Interstitial preload error:', error?.message || error);
        interstitialLoadingRef.current = false;
        // Faster retry so an interstitial is ready before the user hits the
        // 50-60 click threshold. 10s was too slow — AdMob quota rarely fails
        // twice in 5s, so this is safe.
        setTimeout(loadInterstitialAd, 5000);
      });

      const unsub3 = ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Interstitial CLOSED, pre-loading next');
        interstitialRef.current = null;
        interstitialLoadingRef.current = false;
        setTimeout(loadInterstitialAd, 500); // near-instant refill
      });

      interstitialUnsubsRef.current = [unsub1, unsub2, unsub3];
      ad.load();
    } catch (err) {
      console.warn('[AdMob] Failed to create interstitial ad:', err);
      interstitialLoadingRef.current = false;
    }
  }, [isPro]);

  // ============================================================
  // REWARDED AD - Fixed pattern:
  // Creates fresh instance with fresh listeners each time.
  // Called after SDK init and again after each ad close.
  // ============================================================
  const setupAndLoadRewardedAd = useCallback(() => {
    try {
      // Clean up any previous instance listeners
      cleanupRewardedListeners();

      console.log('[AdMob] Creating fresh rewarded ad instance. Ad Unit:', AD_IDS.rewarded);
      const ad = RewardedAd.createForAdRequest(AD_IDS.rewarded, {});
      rewardedAdRef.current = ad;

      const unsubs: (() => void)[] = [];

      unsubs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] REWARDED AD LOADED SUCCESSFULLY! Ad Unit:', AD_IDS.rewarded);
        setIsRewardedAdReady(true);
      }));

      unsubs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: any) => {
        console.log('[AdMob] REWARD EARNED! Type:', reward?.type, 'Amount:', reward?.amount);
        rewardEarnedRef.current = true;
      }));

      unsubs.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Rewarded ad CLOSED. Earned:', rewardEarnedRef.current);
        const earned = rewardEarnedRef.current;
        rewardEarnedRef.current = false;
        setIsRewardedAdReady(false);

        if (rewardResolverRef.current) {
          rewardResolverRef.current(earned);
          rewardResolverRef.current = null;
        }

        // Create fresh instance with fresh listeners for next ad (fast refill
        // so a user clicking "Watch Ad 2 of 3" doesn't wait 5+ seconds).
        setTimeout(() => setupAndLoadRewardedAd(), 500);
      }));

      unsubs.push(ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        const errCode = error?.code || 'unknown';
        const errMsg = error?.message || 'No details';
        console.warn(`[AdMob] Rewarded preload ERROR: code=${errCode}, msg=${errMsg}, full=${JSON.stringify(error)}`);
        setIsRewardedAdReady(false);
        // Clean up failed instance and create fresh one. Aggressive retry
        // (1.5-4s) so a rewarded ad is almost always pre-loaded whenever
        // user taps Unlock. User explicitly asked for "ads preload rehni
        // chahiye har time par".
        cleanupRewardedListeners();
        rewardedAdRef.current = null;
        const retryDelay = 1500 + Math.random() * 2500; // 1.5-4s
        setTimeout(() => {
          if (sdkInitialized) {
            console.log(`[AdMob] Retrying rewarded ad with FRESH instance after ${Math.round(retryDelay)}ms...`);
            setupAndLoadRewardedAd();
          }
        }, retryDelay);
      }));

      rewardedListenersRef.current = unsubs;

      console.log('[AdMob] Loading rewarded ad...');
      ad.load();
    } catch (err) {
      console.warn('[AdMob] setupAndLoadRewardedAd EXCEPTION:', err);
      // Retry after delay
      setTimeout(() => {
        if (sdkInitialized) setupAndLoadRewardedAd();
      }, 5000);
    }
  }, []);

  // Cleanup rewarded ad listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRewardedListeners();
    };
  }, []);

  // Re-arm rewarded preload whenever the app returns to the foreground so
  // users coming back from a phone lock / app-switch always find an ad
  // ready to show. Also fires periodic re-check every 60s in case both the
  // initial load and ERROR-retry chain have somehow failed silently.
  useEffect(() => {
    const fgSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && sdkInitialized && !isRewardedAdReady && !isPro) {
        console.log('[AdMob] App became active & rewarded not ready → preloading…');
        setupAndLoadRewardedAd();
      }
    });
    const keepalive = setInterval(() => {
      if (sdkInitialized && !isRewardedAdReady && !isPro && !rewardedAdRef.current) {
        console.log('[AdMob] Keep-alive tick: rewarded ad absent → preloading…');
        setupAndLoadRewardedAd();
      }
    }, 60000);
    return () => {
      fgSub.remove();
      clearInterval(keepalive);
    };
  }, [isRewardedAdReady, isPro, setupAndLoadRewardedAd]);

  // ========== APP OPEN AD — PRELOAD CYCLE ==========
  //
  // Must be defined BEFORE the SDK-init useEffect below because that effect
  // references it in its dependency array — JS `const` has Temporal Dead
  // Zone so any access before the `useCallback` line throws ReferenceError.
  const preloadAppOpenAd = useCallback(() => {
    if (isPro) return;
    if (appOpenLoadingRef.current || appOpenReadyRef.current) return;
    appOpenLoadingRef.current = true;
    cleanupAppOpenListeners();
    try {
      const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen, {});
      appOpenAdRef.current = ad;

      const unsubs: (() => void)[] = [];
      unsubs.push(ad.addAdEventListener(AdEventType.LOADED, () => {
        console.log('[AdMob] App Open Ad PRE-LOADED (ready)');
        appOpenReadyRef.current = true;
        appOpenLoadingRef.current = false;
      }));
      unsubs.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] App Open Ad CLOSED - refilling');
        appOpenReadyRef.current = false;
        appOpenAdRef.current = null;
        cleanupAppOpenListeners();
        setTimeout(preloadAppOpenAd, 500);
      }));
      unsubs.push(ad.addAdEventListener(AdEventType.ERROR, (err: any) => {
        console.warn('[AdMob] App Open preload error:', err?.message || err);
        appOpenReadyRef.current = false;
        appOpenLoadingRef.current = false;
        appOpenAdRef.current = null;
        cleanupAppOpenListeners();
        setTimeout(preloadAppOpenAd, 5000 + Math.random() * 5000);
      }));
      appOpenUnsubsRef.current = unsubs;
      ad.load();
    } catch (err) {
      appOpenLoadingRef.current = false;
      console.warn('[AdMob] preloadAppOpenAd exception:', err);
    }
  }, [isPro]);

  // ========== SDK INIT WITH UMP CONSENT ==========
  useEffect(() => {
    const initWithConsent = async () => {
      // Step 1: Try UMP consent (non-blocking - won't prevent ad loading)
      try {
        console.log('[AdMob] Requesting UMP consent info update...');
        // Try newer API first, fallback to older API with publisher IDs
        let consentInfo: any;
        try {
          consentInfo = await AdsConsent.requestInfoUpdate();
        } catch {
          // Fallback for older v14.x API that requires publisher IDs
          console.log('[AdMob] Trying consent with publisher IDs...');
          consentInfo = await (AdsConsent as any).requestInfoUpdate(['pub-9675798593675825']);
        }
        console.log('[AdMob] Consent info:', JSON.stringify(consentInfo));

        // Show consent form if required (EEA users)
        const status = consentInfo?.status;
        if (status === AdsConsentStatus?.REQUIRED || status === 'REQUIRED' || status === 2) {
          console.log('[AdMob] Consent required - showing form...');
          try {
            await AdsConsent.loadAndShowConsentFormIfRequired();
            console.log('[AdMob] Consent form completed');
          } catch (formErr) {
            console.warn('[AdMob] Consent form error (non-fatal):', formErr);
          }
        } else {
          console.log('[AdMob] Consent not required, status:', status);
        }
      } catch (consentErr) {
        console.warn('[AdMob] UMP consent error (non-fatal, proceeding):', consentErr);
      }

      // Step 2: Always initialize SDK regardless of consent result
      try {
        await mobileAds().setRequestConfiguration({
          testDeviceIdentifiers: [],
        });
        const adapterStatuses = await mobileAds().initialize();
        console.log('[AdMob] SDK initialized successfully');
        if (adapterStatuses) {
          console.log('[AdMob] Adapter statuses:', JSON.stringify(adapterStatuses));
        }
        sdkInitialized = true;
        setIsAdMobInitialized(true);

        // Step 3: Load ads
        console.log('[AdMob] SDK ready - setting up rewarded ad. Ad Unit:', AD_IDS.rewarded);
        console.log('[AdMob] All Ad Units:', JSON.stringify(AD_IDS));
        setupAndLoadRewardedAd();
        loadInterstitialAd();
        preloadAppOpenAd();
      } catch (initErr) {
        console.warn('[AdMob] SDK init failed:', initErr);
        sdkInitialized = true;
        setIsAdMobInitialized(true);
        setTimeout(() => setupAndLoadRewardedAd(), 2000);
        setTimeout(loadInterstitialAd, 3000);
        setTimeout(preloadAppOpenAd, 4000);
      }
    };

    initWithConsent();

    return () => {
      cleanupInterstitialListeners();
      cleanupAppOpenListeners();
    };
  }, [loadInterstitialAd, setupAndLoadRewardedAd, preloadAppOpenAd]);

  // ========== PRIVACY OPTIONS FORM (for Settings page) ==========
  const showPrivacyOptionsForm = async (): Promise<void> => {
    try {
      console.log('[AdMob] Showing privacy options form...');
      await AdsConsent.showPrivacyOptionsForm();
      console.log('[AdMob] Privacy options form closed');
    } catch (err) {
      console.warn('[AdMob] Privacy options form error:', err);
      // Fallback: try to show regular consent form
      try {
        await AdsConsent.loadAndShowConsentFormIfRequired();
      } catch (fallbackErr) {
        console.warn('[AdMob] Fallback consent form also failed:', fallbackErr);
        Alert.alert('Privacy Settings', 'Unable to load privacy settings. Please try again later.');
      }
    }
  };

  // ========== APP OPEN AD ==========
  //
  // The preloadAppOpenAd definition lives earlier in the file (above the SDK
  // init useEffect) to avoid TDZ issues with the useEffect deps array. The
  // show-side is here, next to the other "show" helpers, for readability.
  const showAppOpenAd = async (): Promise<void> => {
    if (isPro) {
      console.log('[AdMob] Pro user - skipping App Open Ad');
      return Promise.resolve();
    }

    // Fast path — preloaded ad is ready, show immediately.
    if (appOpenReadyRef.current && appOpenAdRef.current) {
      return new Promise((resolve) => {
        const safety = setTimeout(() => resolve(), 15000);
        const finish = () => { clearTimeout(safety); resolve(); };
        appOpenUnsubsRef.current.push(
          appOpenAdRef.current!.addAdEventListener(AdEventType.CLOSED, finish),
          appOpenAdRef.current!.addAdEventListener(AdEventType.ERROR, finish),
        );
        try {
          appOpenAdRef.current!.show();
        } catch {
          finish();
        }
      });
    }

    // Slow path — preload is still in flight. Wait up to 8s for it to finish
    // loading, then show. If still not ready, silently skip.
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = setInterval(() => {
        if (appOpenReadyRef.current && appOpenAdRef.current) {
          clearInterval(poll);
          try { appOpenAdRef.current.show(); } catch {}
          setTimeout(resolve, 500);
        } else if (Date.now() - start > 8000) {
          clearInterval(poll);
          console.log('[AdMob] App Open Ad not ready within 8s, skipping');
          // Kick off a fresh preload so next time it's ready.
          preloadAppOpenAd();
          resolve();
        }
      }, 300);
    });
  };

  // ========== SHOW REWARDED AD ==========
  // v1.0.11 — ads MUST always appear on click. Flow:
  //   1. If a pre-loaded instance is ready → show immediately (fast path).
  //   2. Else — create a fresh on-demand ad and keep the promise pending
  //      until LOADED fires, then show it. No user-facing "Ad Not Available"
  //      alert; instead we silently retry with a brand-new instance on every
  //      ERROR until we succeed or the caller aborts the Modal.
  //      A soft 45-second global cap returns false so the Modal never hangs
  //      forever; in practice Google's SDK loads in 2-5s.
  const showRewardedAd = async (): Promise<boolean> => {
    console.log('[AdMob] showRewardedAd called, isReady:', isRewardedAdReady);

    // FAST PATH — a preloaded ad is ready, show immediately.
    if (isRewardedAdReady && rewardedAdRef.current) {
      return new Promise((resolve) => {
        rewardResolverRef.current = resolve;
        rewardEarnedRef.current = false;

        const safetyTimeout = setTimeout(() => {
          console.log('[AdMob] showRewardedAd safety timeout (30s)');
          if (rewardResolverRef.current) {
            rewardResolverRef.current(rewardEarnedRef.current);
            rewardResolverRef.current = null;
          }
        }, 30000);

        try {
          console.log('[AdMob] Showing pre-loaded rewarded ad...');
          rewardedAdRef.current!.show();
        } catch (err) {
          console.warn('[AdMob] rewardedAd.show() failed:', err);
          clearTimeout(safetyTimeout);
          rewardResolverRef.current = null;
          // Fall through to on-demand path below
          resolve(false);
          // Kick off a fresh preload so subsequent presses work
          setTimeout(() => setupAndLoadRewardedAd(), 200);
        }
      });
    }

    // ON-DEMAND PATH — preload wasn't ready. Retry loop until an ad loads.
    // We intentionally DO NOT show an alert on failure — user-visible
    // "Ad Not Available" is the bug the user reported. Instead we keep
    // asking AdMob for an ad until one lands, or a 45s global cap expires.
    console.log('[AdMob] Rewarded ad not ready → on-demand retry loop starting...');
    return new Promise((resolve) => {
      const globalStart = Date.now();
      const GLOBAL_CAP_MS = 45000;
      let settled = false;
      let currentAd: ReturnType<typeof RewardedAd.createForAdRequest> | null = null;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const tryLoad = () => {
        if (settled) return;
        if (Date.now() - globalStart > GLOBAL_CAP_MS) {
          console.log('[AdMob] On-demand retry loop hit 45s global cap — giving up');
          finish(false);
          // Make sure a fresh preload is in flight for next time
          setTimeout(() => setupAndLoadRewardedAd(), 500);
          return;
        }

        try {
          const ad = RewardedAd.createForAdRequest(AD_IDS.rewarded, {});
          currentAd = ad;
          let thisAdHandled = false;
          let rewarded = false;

          ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
            if (thisAdHandled) return;
            thisAdHandled = true;
            console.log('[AdMob] On-demand rewarded ad LOADED — showing');
            try { ad.show(); } catch (e) {
              console.warn('[AdMob] On-demand show failed:', e);
              // Treat as error → retry with a fresh instance
              setTimeout(tryLoad, 500);
            }
          });

          ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            console.log('[AdMob] On-demand: REWARD EARNED');
            rewarded = true;
          });

          ad.addAdEventListener(AdEventType.CLOSED, () => {
            console.log('[AdMob] On-demand: CLOSED, rewarded =', rewarded);
            finish(rewarded);
            // Preload next rewarded so subsequent presses are instant
            setTimeout(() => setupAndLoadRewardedAd(), 500);
          });

          ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
            if (thisAdHandled) return;
            thisAdHandled = true;
            console.warn('[AdMob] On-demand ERROR:', error?.code, error?.message, '— retrying');
            // Silent retry with a fresh instance after small backoff.
            // Backoff grows slightly each attempt to respect AdMob quota.
            const elapsed = Date.now() - globalStart;
            const backoff = elapsed < 10000 ? 1500 : elapsed < 25000 ? 3000 : 5000;
            setTimeout(tryLoad, backoff);
          });

          console.log('[AdMob] On-demand: loading attempt…');
          ad.load();
        } catch (err) {
          console.warn('[AdMob] On-demand EXCEPTION:', err);
          setTimeout(tryLoad, 2000);
        }
      };

      tryLoad();
    });
  };

  // ========== INTERSTITIAL AD (existing working pattern - untouched) ==========
  const showInterstitialAd = async (): Promise<boolean> => {
    if (isPro) return false;

    const ad = interstitialRef.current;
    if (ad) {
      return new Promise((resolve) => {
        try {
          interstitialRef.current = null;
          ad.show();
          resolve(true);
        } catch (err) {
          interstitialRef.current = null;
          interstitialLoadingRef.current = false;
          setTimeout(loadInterstitialAd, 1000);
          resolve(false);
        }
      });
    }

    // Fallback on-demand
    loadInterstitialAd();
    return new Promise((resolve) => {
      try {
        const fallbackAd = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {});
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

  // v1.0.11 — BannerAdComponent converted to a thin wrapper around our
  // new <NativeAdCard />. Every placement site in the codebase previously
  // rendered <BannerAdComponent /> and we now reroute those to a rotating
  // Native Advanced ad (3 IDs, round-robin) per the user's 2026-04-20
  // brief. The wrapper keeps the old API so call sites don't break and
  // remain findable in future audits — but policy/spacing is now enforced
  // upstream by the component itself (Pro-aware, dark premium card,
  // collapses if no fill).
  //
  // Historical <BannerAd /> from google-mobile-ads is NO LONGER RENDERED
  // anywhere in the app. The banner AD_ID stays in AD_IDS purely for
  // bookkeeping; it isn't wired into any view.
  const BannerAdComponent: React.FC = () => {
    // Lazy require to avoid a hard import cycle between AdMobContext and
    // NativeAdCard (NativeAdCard itself consumes usePro from ProContext,
    // not from us, so this is safe).
    const LazyNative = require('./../components/NativeAdCard').default;
    return <LazyNative />;
  };

  return (
    <AdMobContext.Provider value={{
      isAdMobInitialized, isPro, trackClick,
      showAppOpenAd, showInterstitialAd, showRewardedAd, showPrivacyOptionsForm, isRewardedAdReady,
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
