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

// Storage keys for ad count persistence
const AD_COUNT_KEY = 'crickapp_ad_count';
const PRO_EXPIRY_KEY = 'crickapp_pro_expiry_admob';

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  showRewardedAd: () => Promise<boolean>;
  isRewardedAdReady: boolean;
  isRewardedAdLoading: boolean;
  adsWatchedCount: number;
  BannerAdComponent: React.FC;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isPro: globalIsPro, setProFromAdMob } = usePro();
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  const [isRewardedAdReady, setIsRewardedAdReady] = useState(false);
  const [isRewardedAdLoading, setIsRewardedAdLoading] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [clickTarget] = useState(Math.floor(Math.random() * 6) + 10);
  
  // Ad count tracking for 3-ads Pro unlock
  const [adsWatchedCount, setAdsWatchedCount] = useState(0);
  const [localIsPro, setLocalIsPro] = useState(false);

  const rewardedRef = useRef<RewardedAd | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // Effective Pro status (either global or local)
  const isPro = globalIsPro || localIsPro;

  // Load saved ad count and pro status on mount
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const savedCount = await AsyncStorage.getItem(AD_COUNT_KEY);
        const savedExpiry = await AsyncStorage.getItem(PRO_EXPIRY_KEY);
        
        if (savedCount) {
          setAdsWatchedCount(parseInt(savedCount, 10));
        }
        
        if (savedExpiry) {
          const expiryTime = parseInt(savedExpiry, 10);
          if (Date.now() < expiryTime) {
            setLocalIsPro(true);
            setProFromAdMob(true);
          } else {
            // Expired - clear
            await AsyncStorage.removeItem(PRO_EXPIRY_KEY);
            await AsyncStorage.removeItem(AD_COUNT_KEY);
          }
        }
      } catch (e) {
        console.warn('[AdMob] Error loading saved state:', e);
      }
    };
    loadSavedState();
  }, []);

  // Create and load rewarded ad
  const loadRewardedAd = useCallback(() => {
    if (isRewardedAdLoading || isRewardedAdReady) {
      console.log('[AdMob] Ad already loading or ready, skipping');
      return;
    }

    console.log('[AdMob] Starting to load rewarded ad...');
    setIsRewardedAdLoading(true);
    setIsRewardedAdReady(false);

    try {
      const rewarded = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
        requestNonPersonalizedAdsOnly: true,
      });

      // Listen for load success
      const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] Rewarded ad LOADED successfully!');
        rewardedRef.current = rewarded;
        setIsRewardedAdReady(true);
        setIsRewardedAdLoading(false);
        retryCountRef.current = 0;
      });

      // Listen for errors
      const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] Rewarded ad load error:', error?.message || error);
        setIsRewardedAdLoading(false);
        setIsRewardedAdReady(false);
        rewardedRef.current = null;

        // Retry with exponential backoff
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30000);
          console.log(`[AdMob] Will retry in ${delay}ms (attempt ${retryCountRef.current}/${maxRetries})`);
          setTimeout(loadRewardedAd, delay);
        } else {
          console.warn('[AdMob] Max retries reached for rewarded ad');
        }
      });

      // Start loading
      rewarded.load();
    } catch (err) {
      console.warn('[AdMob] Failed to create rewarded ad:', err);
      setIsRewardedAdLoading(false);
      
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setTimeout(loadRewardedAd, 5000);
      }
    }
  }, [isRewardedAdLoading, isRewardedAdReady]);

  // Initialize AdMob on mount
  useEffect(() => {
    console.log('[AdMob] Initializing SDK...');
    
    mobileAds()
      .setRequestConfiguration({
        testDeviceIdentifiers: ['553c7721-4821-461b-9f62-8584b1e60745']
      })
      .then(() => mobileAds().initialize())
      .then(() => {
        console.log('[AdMob] SDK initialized successfully');
        setIsAdMobInitialized(true);
        // Start loading rewarded ad immediately
        loadRewardedAd();
      })
      .catch((err) => {
        console.warn('[AdMob] SDK init failed:', err);
        setIsAdMobInitialized(true);
        // Still try to load ads
        setTimeout(loadRewardedAd, 2000);
      });
  }, []);

  // Reload ad when it becomes not ready (after showing)
  useEffect(() => {
    if (isAdMobInitialized && !isRewardedAdReady && !isRewardedAdLoading) {
      const timer = setTimeout(() => {
        console.log('[AdMob] Auto-reloading rewarded ad...');
        loadRewardedAd();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAdMobInitialized, isRewardedAdReady, isRewardedAdLoading, loadRewardedAd]);

  // Show App Open Ad (once on app start)
  const showAppOpenAd = async (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const ad = AppOpenAd.createForAdRequest(AD_IDS.appOpen);
        const timeout = setTimeout(resolve, 6000);
        
        ad.addAdEventListener(AdEventType.LOADED, () => {
          console.log('[AdMob] App Open ad loaded, showing...');
          ad.show();
        });
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] App Open ad closed');
          clearTimeout(timeout);
          resolve();
        });
        ad.addAdEventListener(AdEventType.ERROR, (err) => {
          console.warn('[AdMob] App Open ad error:', err);
          clearTimeout(timeout);
          resolve();
        });
        
        ad.load();
      } catch (e) {
        console.warn('[AdMob] App Open ad exception:', e);
        resolve();
      }
    });
  };

  // Show Rewarded Ad and track count for Pro unlock
  const showRewardedAd = async (): Promise<boolean> => {
    return new Promise(async (resolve) => {
      const ad = rewardedRef.current;
      
      if (!ad || !isRewardedAdReady) {
        console.log('[AdMob] Rewarded ad not ready, loading...');
        loadRewardedAd();
        Alert.alert(
          'Ad Loading',
          'Please wait a moment while we prepare the ad...',
          [{ text: 'OK' }]
        );
        resolve(false);
        return;
      }

      console.log('[AdMob] Showing rewarded ad...');
      let earnedReward = false;

      try {
        // Listen for reward earned
        const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
          console.log('[AdMob] REWARD EARNED!', reward);
          earnedReward = true;
        });

        // Listen for ad closed
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, async () => {
          console.log('[AdMob] Rewarded ad closed, earnedReward:', earnedReward);
          unsubEarned();
          unsubClosed();
          
          // Clear current ad reference
          rewardedRef.current = null;
          setIsRewardedAdReady(false);
          
          if (earnedReward) {
            // Increment ad count
            const newCount = adsWatchedCount + 1;
            setAdsWatchedCount(newCount);
            await AsyncStorage.setItem(AD_COUNT_KEY, newCount.toString());
            
            console.log(`[AdMob] Ad count: ${newCount}/3`);
            
            if (newCount >= 3) {
              // UNLOCK PRO!
              const expiryTime = Date.now() + 30 * 60 * 1000; // 30 minutes
              setLocalIsPro(true);
              setProFromAdMob(true);
              await AsyncStorage.setItem(PRO_EXPIRY_KEY, expiryTime.toString());
              await AsyncStorage.setItem(AD_COUNT_KEY, '0'); // Reset count
              setAdsWatchedCount(0);
              
              console.log('[AdMob] PRO UNLOCKED for 30 minutes!');
            }
            
            resolve(true);
          } else {
            resolve(false);
          }
          
          // Load next ad
          setTimeout(loadRewardedAd, 500);
        });

        // Show the ad
        await ad.show();
      } catch (err) {
        console.warn('[AdMob] Error showing rewarded ad:', err);
        rewardedRef.current = null;
        setIsRewardedAdReady(false);
        setTimeout(loadRewardedAd, 1000);
        resolve(false);
      }
    });
  };

  // Show Interstitial Ad (for non-Pro users on random clicks)
  const showInterstitialAd = async (): Promise<boolean> => {
    if (isPro) return false;
    
    return new Promise((resolve) => {
      try {
        const ad = InterstitialAd.createForAdRequest(AD_IDS.interstitial);
        const timeout = setTimeout(() => resolve(false), 10000);
        
        ad.addAdEventListener(AdEventType.LOADED, () => {
          console.log('[AdMob] Interstitial loaded, showing...');
          ad.show();
        });
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] Interstitial closed');
          clearTimeout(timeout);
          resolve(true);
        });
        ad.addAdEventListener(AdEventType.ERROR, (err) => {
          console.warn('[AdMob] Interstitial error:', err);
          clearTimeout(timeout);
          resolve(false);
        });
        
        ad.load();
      } catch (e) {
        console.warn('[AdMob] Interstitial exception:', e);
        resolve(false);
      }
    });
  };

  // Track clicks for interstitial (non-Pro only)
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

  // Banner Ad Component
  const BannerAdComponent: React.FC = () => (
    <BannerAd
      unitId={AD_IDS.banner}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );

  return (
    <AdMobContext.Provider value={{
      isAdMobInitialized,
      isPro,
      trackClick,
      showAppOpenAd,
      showInterstitialAd,
      showRewardedAd,
      isRewardedAdReady,
      isRewardedAdLoading,
      adsWatchedCount,
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
