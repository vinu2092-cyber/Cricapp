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
  appOpen: 'ca-app-pub-9675798593675825/4826782503',
  interstitial: 'ca-app-pub-9675798593675825/8438724452',
  banner: 'ca-app-pub-9675798593675825/8616886104',
  rewarded: 'ca-app-pub-9675798593675825/6702740458',
};

// ============================================================
// CRITICAL: Create RewardedAd instance OUTSIDE the component
// This prevents re-creation on every render (documentation pattern)
// ============================================================
let rewardedAdInstance = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
  requestNonPersonalizedAdsOnly: true,
});
// Track if SDK is initialized (for load gating)
let sdkInitialized = false;

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

  // Interstitial refs (keep existing working pattern)
  const interstitialRef = useRef<InterstitialAd | null>(null);
  const interstitialLoadingRef = useRef(false);
  const interstitialUnsubsRef = useRef<(() => void)[]>([]);

  // Rewarded ad state
  const rewardResolverRef = useRef<((result: boolean) => void) | null>(null);
  const rewardEarnedRef = useRef(false);

  const cleanupInterstitialListeners = () => {
    interstitialUnsubsRef.current.forEach(u => { try { u(); } catch {} });
    interstitialUnsubsRef.current = [];
  };

  // Pre-load interstitial ad (existing working pattern - untouched)
  const loadInterstitialAd = useCallback(() => {
    if (interstitialLoadingRef.current) return;
    if (interstitialRef.current) return;
    if (isPro) return;

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
  // REWARDED AD - Following exact documentation pattern:
  // Instance declared outside component, listeners in useEffect
  // ============================================================
  useEffect(() => {
    console.log('[AdMob] Setting up Rewarded Ad event listeners on singleton instance');

    const unsubLoaded = rewardedAdInstance.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        console.log('[AdMob] REWARDED AD LOADED! Ad Unit:', AD_IDS.rewarded);
        setIsRewardedAdReady(true);
      }
    );

    const unsubEarned = rewardedAdInstance.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        console.log('[AdMob] REWARD EARNED! Type:', reward?.type, 'Amount:', reward?.amount);
        rewardEarnedRef.current = true;
      }
    );

    const unsubClosed = rewardedAdInstance.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        console.log('[AdMob] Rewarded ad CLOSED. Earned:', rewardEarnedRef.current);
        const earned = rewardEarnedRef.current;
        rewardEarnedRef.current = false;
        setIsRewardedAdReady(false);

        // Resolve the promise from showRewardedAd
        if (rewardResolverRef.current) {
          rewardResolverRef.current(earned);
          rewardResolverRef.current = null;
        }

        // Recreate and reload for next time
        console.log('[AdMob] Recreating rewarded ad instance for next load');
        rewardedAdInstance = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
          requestNonPersonalizedAdsOnly: true,
        });
        // Re-register listeners on new instance is handled by re-running this effect
        // But since the instance is outside, we need to manually load
        setTimeout(() => {
          rewardedAdInstance.load();
          console.log('[AdMob] Reloaded rewarded ad after close');
        }, 1000);
      }
    );

    const unsubError = rewardedAdInstance.addAdEventListener(
      AdEventType.ERROR,
      (error: any) => {
        console.warn('[AdMob] Rewarded ad ERROR:', error?.message || error?.code || JSON.stringify(error));
        setIsRewardedAdReady(false);
        // Retry loading after 5 seconds (only if SDK is initialized)
        setTimeout(() => {
          if (sdkInitialized) {
            console.log('[AdMob] Retrying rewarded ad load after error...');
            try {
              rewardedAdInstance.load();
            } catch (e) {
              console.warn('[AdMob] Retry load failed:', e);
            }
          }
        }, 5000);
      }
    );

    // Do NOT load here - wait for SDK initialization
    // load() is called from the SDK init useEffect
    console.log('[AdMob] Rewarded ad listeners registered, waiting for SDK init to load...');

    return () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
    };
  }, []);

  // ========== SDK INIT ==========
  useEffect(() => {
    mobileAds()
      .setRequestConfiguration({
        testDeviceIdentifiers: [],
      })
      .then(() => mobileAds().initialize())
      .then((adapterStatuses) => {
        console.log('[AdMob] SDK initialized successfully');
        if (adapterStatuses) {
          console.log('[AdMob] Adapter statuses:', JSON.stringify(adapterStatuses));
        }
        sdkInitialized = true;
        setIsAdMobInitialized(true);
        // NOW load the rewarded ad (after SDK is ready)
        console.log('[AdMob] SDK ready - loading rewarded ad...');
        try {
          rewardedAdInstance.load();
        } catch (e) {
          console.warn('[AdMob] Initial rewarded load failed:', e);
        }
        loadInterstitialAd();
      })
      .catch((err) => {
        console.warn('[AdMob] SDK init failed:', err);
        sdkInitialized = true; // Still allow ad attempts
        setIsAdMobInitialized(true);
        setTimeout(() => {
          try { rewardedAdInstance.load(); } catch {}
        }, 2000);
        setTimeout(loadInterstitialAd, 3000);
      });

    return () => {
      cleanupInterstitialListeners();
    };
  }, [loadInterstitialAd]);

  // ========== APP OPEN AD ==========
  const showAppOpenAd = async (): Promise<void> => {
    if (isPro) {
      console.log('[AdMob] Pro user - skipping App Open Ad');
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen, {
          requestNonPersonalizedAdsOnly: true,
        });

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

    if (isRewardedAdReady) {
      // Ad is pre-loaded, show it directly
      return new Promise((resolve) => {
        rewardResolverRef.current = resolve;
        rewardEarnedRef.current = false;

        // Safety timeout
        const safetyTimeout = setTimeout(() => {
          console.log('[AdMob] showRewardedAd safety timeout (25s)');
          if (rewardResolverRef.current) {
            rewardResolverRef.current(rewardEarnedRef.current);
            rewardResolverRef.current = null;
          }
        }, 25000);

        try {
          console.log('[AdMob] Calling rewardedAdInstance.show()...');
          rewardedAdInstance.show();
        } catch (err) {
          console.warn('[AdMob] rewardedAdInstance.show() failed:', err);
          clearTimeout(safetyTimeout);
          rewardResolverRef.current = null;
          resolve(false);
        }
      });
    }

    // Ad not ready - try on-demand load
    console.log('[AdMob] Rewarded ad not ready, attempting on-demand load...');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[AdMob] On-demand rewarded ad TIMEOUT (15s)');
        Alert.alert(
          'Ad Not Available',
          'Rewarded ad is not available right now. Please try again in a moment.',
        );
        resolve(false);
      }, 15000);

      try {
        // Create a fresh on-demand instance
        const onDemandAd = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
          requestNonPersonalizedAdsOnly: true,
        });

        let handled = false;

        onDemandAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          if (handled) return;
          handled = true;
          console.log('[AdMob] On-demand rewarded ad LOADED, showing...');
          clearTimeout(timeout);

          // Set up reward tracking for this on-demand ad
          let rewarded = false;

          onDemandAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            console.log('[AdMob] On-demand: REWARD EARNED!');
            rewarded = true;
          });

          onDemandAd.addAdEventListener(AdEventType.CLOSED, () => {
            console.log('[AdMob] On-demand: ad CLOSED, rewarded:', rewarded);
            resolve(rewarded);
            // Reload the singleton for next time
            rewardedAdInstance = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
              requestNonPersonalizedAdsOnly: true,
            });
            setTimeout(() => rewardedAdInstance.load(), 1000);
          });

          try {
            onDemandAd.show();
          } catch (showErr) {
            console.warn('[AdMob] On-demand show failed:', showErr);
            resolve(false);
          }
        });

        onDemandAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
          if (handled) return;
          handled = true;
          console.warn('[AdMob] On-demand rewarded ERROR:', error?.message || error);
          clearTimeout(timeout);
          Alert.alert('Ad Not Available', 'No ad available right now. Please try again later.');
          resolve(false);
        });

        console.log('[AdMob] On-demand: loading rewarded ad...');
        onDemandAd.load();
      } catch (err) {
        console.warn('[AdMob] On-demand EXCEPTION:', err);
        clearTimeout(timeout);
        Alert.alert('Ad Error', 'Something went wrong. Please try again.');
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
