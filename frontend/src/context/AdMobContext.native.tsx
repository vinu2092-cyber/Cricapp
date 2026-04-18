import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { Alert, Platform, View } from 'react-native';
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

// Production Ad IDs - Real AdMob IDs. These are ALWAYS used in production
// builds for every user — never swapped at runtime. Adding a device to
// `testDeviceIdentifiers` below only tells the AdMob SDK "this specific device
// is a developer test device and should see TEST creatives for these real
// production ad units"; every OTHER device continues to see real ads and
// earn real revenue.
const AD_IDS = {
  appOpen: 'ca-app-pub-9675798593675825/4826782503',
  interstitial: 'ca-app-pub-9675798593675825/8438724452',
  banner: 'ca-app-pub-9675798593675825/8616886104',
  rewarded: 'ca-app-pub-9675798593675825/6702740458',
};

/**
 * Fetch Firebase Remote Config (`app_config/settings`) to obtain a comma/space
 * separated list of AdMob test-device hashes (`test_device_ids`). The only
 * side-effect is that those specific device hashes are passed to
 * `mobileAds().setRequestConfiguration({ testDeviceIdentifiers })`.
 *
 * This is a SAFE, DEVICE-SCOPED mechanism:
 *   - Devices whose hash is in the list → get test-ad creatives for the real
 *     production ad units (safe during development).
 *   - Every OTHER device → gets real AdMob ads as usual (revenue preserved).
 *
 * No ad unit IDs are ever swapped, so there is NO way this can accidentally
 * turn production ads off for real users.
 */
async function fetchTestDeviceIdsFromFirebase(): Promise<string[]> {
  try {
    const res = await fetch(
      'https://firestore.googleapis.com/v1/projects/cricapp-2092/databases/(default)/documents/app_config/settings'
    );
    const json: any = await res.json();
    const raw = (json?.fields?.test_device_ids?.stringValue || '').trim();
    return raw
      .split(/[,\s;]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  } catch (e) {
    console.warn('[AdMob] Could not load Firebase test-device list:', e);
    return [];
  }
}

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
        setTimeout(loadInterstitialAd, 10000);
      });

      const unsub3 = ad.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Interstitial CLOSED, pre-loading next');
        interstitialRef.current = null;
        interstitialLoadingRef.current = false;
        setTimeout(loadInterstitialAd, 1000);
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

        // Create fresh instance with fresh listeners for next ad
        setTimeout(() => setupAndLoadRewardedAd(), 1000);
      }));

      unsubs.push(ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        const errCode = error?.code || 'unknown';
        const errMsg = error?.message || 'No details';
        console.warn(`[AdMob] Rewarded preload ERROR: code=${errCode}, msg=${errMsg}, full=${JSON.stringify(error)}`);
        setIsRewardedAdReady(false);
        // Clean up failed instance and create fresh one with exponential backoff
        cleanupRewardedListeners();
        rewardedAdRef.current = null;
        const retryDelay = Math.min(5000 * (1 + Math.random()), 30000);
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
        // Pull ONLY the test-device list from Firestore so the user can
        // register their personal test device without a rebuild. Production
        // ad-unit IDs are never swapped — every non-listed device continues to
        // see real ads and earn revenue.
        const testDeviceIds = await fetchTestDeviceIdsFromFirebase();
        // Always register the standard EMULATOR identifier (no-op on real
        // devices) plus any user-supplied device hashes from Firestore.
        const mergedTestIds = Array.from(new Set([...testDeviceIds, 'EMULATOR']));
        console.log('[AdMob] testDeviceIdentifiers =', JSON.stringify(mergedTestIds));

        await mobileAds().setRequestConfiguration({
          testDeviceIdentifiers: mergedTestIds,
        });
        const adapterStatuses = await mobileAds().initialize();
        console.log('[AdMob] SDK initialized successfully');
        if (adapterStatuses) {
          console.log('[AdMob] Adapter statuses:', JSON.stringify(adapterStatuses));
        }
        sdkInitialized = true;
        setIsAdMobInitialized(true);

        // Step 3: Load ads (always production ad unit IDs)
        console.log('[AdMob] SDK ready - setting up rewarded ad. Ad Unit:', AD_IDS.rewarded);
        console.log('[AdMob] All Ad Units (prod):', JSON.stringify(AD_IDS));
        console.log(
          '[AdMob] 💡 If your test device still shows NO_FILL: grab the hash' +
            ' printed by the SDK in logcat ("RequestConfiguration.Builder' +
            '.setTestDeviceIds([...])") and add it to Firestore ' +
            'app_config/settings.test_device_ids (comma-separated). ' +
            'Real users are NEVER affected by that list.'
        );
        setupAndLoadRewardedAd();
        loadInterstitialAd();
      } catch (initErr) {
        console.warn('[AdMob] SDK init failed:', initErr);
        sdkInitialized = true;
        setIsAdMobInitialized(true);
        setTimeout(() => setupAndLoadRewardedAd(), 2000);
        setTimeout(loadInterstitialAd, 3000);
      }
    };

    initWithConsent();

    return () => {
      cleanupInterstitialListeners();
    };
  }, [loadInterstitialAd, setupAndLoadRewardedAd]);

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
  const showAppOpenAd = async (): Promise<void> => {
    if (isPro) {
      console.log('[AdMob] Pro user - skipping App Open Ad');
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen, {});

        const timeout = setTimeout(() => {
          console.log('[AdMob] App Open Ad timeout after 15s');
          resolve();
        }, 15000);

        ad.addAdEventListener(AdEventType.LOADED, () => {
          try { ad.show(); } catch (showErr) {
            clearTimeout(timeout);
            resolve();
          }
        });
        ad.addAdEventListener(AdEventType.CLOSED, () => { clearTimeout(timeout); resolve(); });
        ad.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(timeout); resolve(); });
        ad.load();
      } catch (err) {
        resolve();
      }
    });
  };

  // ========== SHOW REWARDED AD ==========
  const showRewardedAd = async (): Promise<boolean> => {
    console.log('[AdMob] showRewardedAd called, isReady:', isRewardedAdReady);

    if (isRewardedAdReady && rewardedAdRef.current) {
      // Ad is pre-loaded, show it directly
      return new Promise((resolve) => {
        rewardResolverRef.current = resolve;
        rewardEarnedRef.current = false;

        const safetyTimeout = setTimeout(() => {
          console.log('[AdMob] showRewardedAd safety timeout (25s)');
          if (rewardResolverRef.current) {
            rewardResolverRef.current(rewardEarnedRef.current);
            rewardResolverRef.current = null;
          }
        }, 25000);

        try {
          console.log('[AdMob] Showing pre-loaded rewarded ad...');
          rewardedAdRef.current!.show();
        } catch (err) {
          console.warn('[AdMob] rewardedAd.show() failed:', err);
          clearTimeout(safetyTimeout);
          rewardResolverRef.current = null;
          resolve(false);
        }
      });
    }

    // Ad not ready - try on-demand load with real ad unit
    console.log('[AdMob] Rewarded ad not ready, attempting on-demand load...');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[AdMob] On-demand rewarded ad TIMEOUT (15s) — silent fail so fallthrough can credit user');
        resolve(false);
      }, 15000);

      try {
        const onDemandAd = RewardedAd.createForAdRequest(AD_IDS.rewarded, {});
        let handled = false;

        onDemandAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          if (handled) return;
          handled = true;
          console.log('[AdMob] On-demand rewarded ad LOADED!');
          clearTimeout(timeout);

          let rewarded = false;
          onDemandAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            console.log('[AdMob] On-demand: REWARD EARNED!');
            rewarded = true;
          });
          onDemandAd.addAdEventListener(AdEventType.CLOSED, () => {
            console.log('[AdMob] On-demand: ad CLOSED, rewarded:', rewarded);
            resolve(rewarded);
            setTimeout(() => setupAndLoadRewardedAd(), 1000);
          });

          try { onDemandAd.show(); } catch (showErr) {
            console.warn('[AdMob] On-demand show failed:', showErr);
            resolve(false);
          }
        });

        onDemandAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
          if (handled) return;
          handled = true;
          console.warn('[AdMob] On-demand ERROR (silent fallthrough):', error?.message, error?.code);
          clearTimeout(timeout);
          resolve(false);
        });

        console.log('[AdMob] On-demand: loading rewarded ad...');
        onDemandAd.load();
      } catch (err) {
        console.warn('[AdMob] On-demand EXCEPTION (silent fallthrough):', err);
        clearTimeout(timeout);
        resolve(false);
      }
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

  const BannerAdComponent: React.FC = () => {
    try {
      const { width: screenWidth } = require('react-native').Dimensions.get('window');
      return (
        <View style={{
          width: screenWidth,
          alignItems: 'center',
          justifyContent: 'center',
          marginVertical: 8,
          overflow: 'hidden',
        }}>
          <BannerAd
            unitId={AD_IDS.banner}
            size={BannerAdSize.MEDIUM_RECTANGLE}
            requestOptions={{ requestNonPersonalizedAdsOnly: false }}
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
