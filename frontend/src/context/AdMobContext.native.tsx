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

// Production Ad Unit IDs
const AD_IDS = {
  appOpen: 'ca-app-pub-9675798593675825/4826782503',
  interstitial: 'ca-app-pub-9675798593675825/8438724452',
  banner: 'ca-app-pub-9675798593675825/8616886104',
  rewarded: 'ca-app-pub-9675798593675825/6702740458',
};

// Storage keys
const STORAGE_KEYS = {
  adCount: 'crickapp_rewarded_ad_count',
  proExpiry: 'crickapp_pro_expiry_from_ads',
};

interface AdMobContextType {
  isAdMobInitialized: boolean;
  isPro: boolean;
  // Rewarded Ad specific
  adsWatchedCount: number;
  isRewardedAdReady: boolean;
  isRewardedAdLoading: boolean;
  showRewardedAd: () => Promise<boolean>;
  // Other ads
  trackClick: () => void;
  showAppOpenAd: () => Promise<void>;
  showInterstitialAd: () => Promise<boolean>;
  BannerAdComponent: React.FC;
}

const AdMobContext = createContext<AdMobContextType | undefined>(undefined);

export const AdMobProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isPro: globalIsPro, setProFromAdMob } = usePro();
  
  // SDK state
  const [isAdMobInitialized, setIsAdMobInitialized] = useState(false);
  
  // Rewarded Ad state
  const [adsWatchedCount, setAdsWatchedCount] = useState(0);
  const [isRewardedAdReady, setIsRewardedAdReady] = useState(false);
  const [isRewardedAdLoading, setIsRewardedAdLoading] = useState(false);
  const [localIsPro, setLocalIsPro] = useState(false);
  
  // Interstitial click tracking
  const [clicks, setClicks] = useState(0);
  const clickTargetRef = useRef(Math.floor(Math.random() * 6) + 10);
  
  // Refs
  const rewardedAdRef = useRef<RewardedAd | null>(null);
  const loadAttemptsRef = useRef(0);
  const maxLoadAttempts = 5;
  
  const isPro = globalIsPro || localIsPro;

  // ==================== INITIALIZATION ====================
  
  // Load saved state from AsyncStorage
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        // Load ad count
        const savedCount = await AsyncStorage.getItem(STORAGE_KEYS.adCount);
        if (savedCount) {
          const count = parseInt(savedCount, 10);
          if (!isNaN(count) && count >= 0 && count < 3) {
            setAdsWatchedCount(count);
            console.log('[AdMob] Restored ad count:', count);
          }
        }
        
        // Load Pro expiry
        const savedExpiry = await AsyncStorage.getItem(STORAGE_KEYS.proExpiry);
        if (savedExpiry) {
          const expiryTime = parseInt(savedExpiry, 10);
          const now = Date.now();
          if (!isNaN(expiryTime) && now < expiryTime) {
            setLocalIsPro(true);
            setProFromAdMob(true);
            console.log('[AdMob] Pro still active, expires in:', Math.round((expiryTime - now) / 60000), 'minutes');
          } else {
            // Expired - clear storage
            await AsyncStorage.multiRemove([STORAGE_KEYS.proExpiry, STORAGE_KEYS.adCount]);
            console.log('[AdMob] Pro expired, cleared storage');
          }
        }
      } catch (error) {
        console.warn('[AdMob] Error loading saved state:', error);
      }
    };
    
    loadSavedState();
  }, []);

  // Initialize AdMob SDK
  useEffect(() => {
    const initializeAdMob = async () => {
      try {
        console.log('[AdMob] Initializing SDK...');
        
        // Set test device configuration
        await mobileAds().setRequestConfiguration({
          testDeviceIdentifiers: ['553c7721-4821-461b-9f62-8584b1e60745'],
        });
        
        // Initialize SDK
        await mobileAds().initialize();
        
        console.log('[AdMob] SDK initialized successfully');
        setIsAdMobInitialized(true);
        
        // Start loading rewarded ad
        loadRewardedAd();
        
      } catch (error) {
        console.warn('[AdMob] SDK initialization failed:', error);
        setIsAdMobInitialized(true); // Allow app to continue
        // Try loading ads anyway
        setTimeout(loadRewardedAd, 2000);
      }
    };
    
    initializeAdMob();
  }, []);

  // ==================== REWARDED AD ====================
  
  const loadRewardedAd = useCallback(() => {
    // Prevent double loading
    if (isRewardedAdLoading) {
      console.log('[AdMob] Already loading rewarded ad, skipping');
      return;
    }
    
    // Check if already ready
    if (rewardedAdRef.current && isRewardedAdReady) {
      console.log('[AdMob] Rewarded ad already ready');
      return;
    }
    
    console.log('[AdMob] Loading rewarded ad...');
    setIsRewardedAdLoading(true);
    setIsRewardedAdReady(false);
    
    try {
      // Create new ad instance
      const rewarded = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
        requestNonPersonalizedAdsOnly: true,
      });
      
      // Event: Ad Loaded
      const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] ✅ Rewarded ad LOADED');
        rewardedAdRef.current = rewarded;
        setIsRewardedAdReady(true);
        setIsRewardedAdLoading(false);
        loadAttemptsRef.current = 0; // Reset attempts on success
      });
      
      // Event: Error
      const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[AdMob] ❌ Rewarded ad error:', error?.message || error);
        setIsRewardedAdLoading(false);
        setIsRewardedAdReady(false);
        rewardedAdRef.current = null;
        
        // Retry with exponential backoff
        loadAttemptsRef.current++;
        if (loadAttemptsRef.current < maxLoadAttempts) {
          const delay = Math.min(2000 * Math.pow(2, loadAttemptsRef.current), 30000);
          console.log(`[AdMob] Retrying in ${delay}ms (attempt ${loadAttemptsRef.current}/${maxLoadAttempts})`);
          setTimeout(loadRewardedAd, delay);
        } else {
          console.warn('[AdMob] Max retry attempts reached');
        }
      });
      
      // Start loading
      rewarded.load();
      
    } catch (error) {
      console.warn('[AdMob] Failed to create rewarded ad:', error);
      setIsRewardedAdLoading(false);
      
      loadAttemptsRef.current++;
      if (loadAttemptsRef.current < maxLoadAttempts) {
        setTimeout(loadRewardedAd, 5000);
      }
    }
  }, [isRewardedAdLoading, isRewardedAdReady]);
  
  // Auto-reload when ad becomes unavailable
  useEffect(() => {
    if (isAdMobInitialized && !isRewardedAdReady && !isRewardedAdLoading) {
      const timer = setTimeout(() => {
        console.log('[AdMob] Auto-reloading rewarded ad...');
        loadRewardedAd();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isAdMobInitialized, isRewardedAdReady, isRewardedAdLoading]);

  // Show Rewarded Ad
  const showRewardedAd = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      const ad = rewardedAdRef.current;
      
      // Check if ad is ready
      if (!ad || !isRewardedAdReady) {
        console.log('[AdMob] Ad not ready, triggering load...');
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
      let hasEarnedReward = false;
      
      try {
        // Event: Earned Reward
        const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
          console.log('[AdMob] 🎉 REWARD EARNED!', reward);
          hasEarnedReward = true;
        });
        
        // Event: Ad Closed
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, async () => {
          console.log('[AdMob] Ad closed, hasEarnedReward:', hasEarnedReward);
          
          // Clean up listeners
          try { unsubEarned(); } catch {}
          try { unsubClosed(); } catch {}
          
          // Clear ad reference
          rewardedAdRef.current = null;
          setIsRewardedAdReady(false);
          
          if (hasEarnedReward) {
            // Increment and save ad count
            const newCount = adsWatchedCount + 1;
            console.log(`[AdMob] Ad count: ${newCount}/3`);
            
            if (newCount >= 3) {
              // UNLOCK PRO!
              console.log('[AdMob] 🏆 PRO UNLOCKED!');
              const expiryTime = Date.now() + 30 * 60 * 1000; // 30 minutes
              
              setAdsWatchedCount(0);
              setLocalIsPro(true);
              setProFromAdMob(true);
              
              // Save to storage
              await AsyncStorage.setItem(STORAGE_KEYS.proExpiry, expiryTime.toString());
              await AsyncStorage.setItem(STORAGE_KEYS.adCount, '0');
              
              resolve(true);
            } else {
              // Save updated count
              setAdsWatchedCount(newCount);
              await AsyncStorage.setItem(STORAGE_KEYS.adCount, newCount.toString());
              resolve(true);
            }
          } else {
            resolve(false);
          }
          
          // Load next ad after short delay
          setTimeout(loadRewardedAd, 1000);
        });
        
        // Show the ad
        ad.show();
        
      } catch (error) {
        console.warn('[AdMob] Error showing ad:', error);
        rewardedAdRef.current = null;
        setIsRewardedAdReady(false);
        setTimeout(loadRewardedAd, 1000);
        resolve(false);
      }
    });
  }, [adsWatchedCount, isRewardedAdReady, loadRewardedAd, setProFromAdMob]);

  // ==================== INTERSTITIAL AD ====================
  
  const showInterstitialAd = useCallback(async (): Promise<boolean> => {
    if (isPro) return false;
    
    return new Promise((resolve) => {
      try {
        const interstitial = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {
          requestNonPersonalizedAdsOnly: true,
        });
        
        const timeout = setTimeout(() => {
          console.log('[AdMob] Interstitial timeout');
          resolve(false);
        }, 10000);
        
        interstitial.addAdEventListener(AdEventType.LOADED, () => {
          console.log('[AdMob] Interstitial loaded');
          interstitial.show();
        });
        
        interstitial.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] Interstitial closed');
          clearTimeout(timeout);
          resolve(true);
        });
        
        interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
          console.warn('[AdMob] Interstitial error:', error);
          clearTimeout(timeout);
          resolve(false);
        });
        
        interstitial.load();
        
      } catch (error) {
        console.warn('[AdMob] Interstitial exception:', error);
        resolve(false);
      }
    });
  }, [isPro]);

  // Track clicks for interstitial trigger
  const trackClick = useCallback(() => {
    if (isPro) return;
    
    const newClicks = clicks + 1;
    if (newClicks >= clickTargetRef.current) {
      setClicks(0);
      clickTargetRef.current = Math.floor(Math.random() * 6) + 10; // New random target
      showInterstitialAd();
    } else {
      setClicks(newClicks);
    }
  }, [clicks, isPro, showInterstitialAd]);

  // ==================== APP OPEN AD ====================
  
  const showAppOpenAd = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const appOpen = AppOpenAd.createForAdRequest(AD_IDS.appOpen, {
          requestNonPersonalizedAdsOnly: true,
        });
        
        const timeout = setTimeout(() => {
          console.log('[AdMob] App open ad timeout');
          resolve();
        }, 6000);
        
        appOpen.addAdEventListener(AdEventType.LOADED, () => {
          console.log('[AdMob] App open ad loaded');
          appOpen.show();
        });
        
        appOpen.addAdEventListener(AdEventType.CLOSED, () => {
          console.log('[AdMob] App open ad closed');
          clearTimeout(timeout);
          resolve();
        });
        
        appOpen.addAdEventListener(AdEventType.ERROR, (error) => {
          console.warn('[AdMob] App open ad error:', error);
          clearTimeout(timeout);
          resolve();
        });
        
        appOpen.load();
        
      } catch (error) {
        console.warn('[AdMob] App open ad exception:', error);
        resolve();
      }
    });
  }, []);

  // ==================== BANNER AD ====================
  
  const BannerAdComponent: React.FC = useCallback(() => (
    <BannerAd
      unitId={AD_IDS.banner}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  ), []);

  // ==================== CONTEXT PROVIDER ====================
  
  return (
    <AdMobContext.Provider value={{
      isAdMobInitialized,
      isPro,
      adsWatchedCount,
      isRewardedAdReady,
      isRewardedAdLoading,
      showRewardedAd,
      trackClick,
      showAppOpenAd,
      showInterstitialAd,
      BannerAdComponent,
    }}>
      {children}
    </AdMobContext.Provider>
  );
};

export const useAdMob = (): AdMobContextType => {
  const context = useContext(AdMobContext);
  if (!context) {
    throw new Error('useAdMob must be used within AdMobProvider');
  }
  return context;
};

export default AdMobProvider;
