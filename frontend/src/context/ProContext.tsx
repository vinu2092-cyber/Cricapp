import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProContextType {
  isPro: boolean;
  proExpiresAt: number | null;
  adsWatched: number;
  isWatchingAds: boolean;
  startAdChallenge: () => void;
  watchAd: () => Promise<boolean>;
  cancelAdChallenge: () => void;
  resetProStatus: () => void;
  getProTimeRemaining: () => number;
  setProFromAdMob: (value: boolean) => void;
  // v1.0.15 — daily share-to-unlock quota (1/day)
  canShareUnlockToday: () => Promise<boolean>;
  markSharedUnlockToday: () => Promise<void>;
}

const ProContext = createContext<ProContextType | undefined>(undefined);

const PRO_STORAGE_KEY = 'crickapp_pro_status';
const PRO_EXPIRY_KEY = 'crickapp_pro_expiry';
const SHARE_UNLOCK_DATE_KEY = 'crickapp_share_unlock_date'; // stores YYYY-MM-DD of last successful share-unlock
const ADS_REQUIRED = 1;
const PRO_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

// Local-day key (YYYY-MM-DD) — uses device local time so the quota resets
// at the user's midnight, matching how "1 per day" is perceived.
const todayKey = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const ProProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(false);
  const [proExpiresAt, setProExpiresAt] = useState<number | null>(null);
  const [adsWatched, setAdsWatched] = useState(0);
  const [isWatchingAds, setIsWatchingAds] = useState(false);

  useEffect(() => {
    loadProStatus();
  }, []);

  // Check Pro expiry periodically
  useEffect(() => {
    if (isPro && proExpiresAt) {
      const checkExpiry = setInterval(() => {
        const now = Date.now();
        if (now >= proExpiresAt) {
          // Pro has expired
          setIsPro(false);
          setProExpiresAt(null);
          AsyncStorage.removeItem(PRO_STORAGE_KEY);
          AsyncStorage.removeItem(PRO_EXPIRY_KEY);
        }
      }, 1000);

      return () => clearInterval(checkExpiry);
    }
  }, [isPro, proExpiresAt]);

  const loadProStatus = async () => {
    try {
      const status = await AsyncStorage.getItem(PRO_STORAGE_KEY);
      const expiry = await AsyncStorage.getItem(PRO_EXPIRY_KEY);
      
      if (status === 'true' && expiry) {
        const expiryTime = parseInt(expiry, 10);
        const now = Date.now();
        
        if (now < expiryTime) {
          setIsPro(true);
          setProExpiresAt(expiryTime);
        } else {
          // Pro has expired
          await AsyncStorage.removeItem(PRO_STORAGE_KEY);
          await AsyncStorage.removeItem(PRO_EXPIRY_KEY);
        }
      }
    } catch (error) {
      console.error('Error loading pro status:', error);
    }
  };

  const saveProStatus = async (status: boolean, expiryTime: number | null) => {
    try {
      await AsyncStorage.setItem(PRO_STORAGE_KEY, status.toString());
      if (expiryTime) {
        await AsyncStorage.setItem(PRO_EXPIRY_KEY, expiryTime.toString());
      }
    } catch (error) {
      console.error('Error saving pro status:', error);
    }
  };

  const startAdChallenge = () => {
    if (!isPro) {
      setIsWatchingAds(true);
      setAdsWatched(0);
    }
  };

  const watchAd = async (): Promise<boolean> => {
    // This will be called after AdMob rewarded ad completion
    const newCount = adsWatched + 1;
    setAdsWatched(newCount);
    
    if (newCount >= ADS_REQUIRED) {
      const expiryTime = Date.now() + PRO_DURATION_MS;
      setIsPro(true);
      setProExpiresAt(expiryTime);
      setIsWatchingAds(false);
      saveProStatus(true, expiryTime);
      return true; // Pro unlocked
    }
    return false; // More ads needed
  };

  const cancelAdChallenge = () => {
    setIsWatchingAds(false);
    setAdsWatched(0);
  };

  const resetProStatus = async () => {
    setIsPro(false);
    setProExpiresAt(null);
    setAdsWatched(0);
    await AsyncStorage.removeItem(PRO_STORAGE_KEY);
    await AsyncStorage.removeItem(PRO_EXPIRY_KEY);
  };

  const getProTimeRemaining = (): number => {
    if (!proExpiresAt) return 0;
    const remaining = proExpiresAt - Date.now();
    return Math.max(0, remaining);
  };

  const setProFromAdMob = (value: boolean) => {
    if (value) {
      const expiryTime = Date.now() + PRO_DURATION_MS;
      setIsPro(true);
      setProExpiresAt(expiryTime);
      setIsWatchingAds(false);
      setAdsWatched(ADS_REQUIRED);
      saveProStatus(true, expiryTime);
    } else {
      resetProStatus();
    }
  };

  // v1.0.15 — Daily share-to-unlock quota (1/day). Returns true if the
  // user has NOT yet claimed today's share-unlock. The stored value is a
  // YYYY-MM-DD string in device-local time. Share flow MUST:
  //   1) call canShareUnlockToday() BEFORE opening the share sheet;
  //   2) if false, prompt user to watch an ad instead;
  //   3) if true, proceed with Share.share();
  //   4) on native Share.sharedAction → call markSharedUnlockToday()
  //      AND setProFromAdMob(true). No Pro on dismiss.
  const canShareUnlockToday = async (): Promise<boolean> => {
    try {
      const last = await AsyncStorage.getItem(SHARE_UNLOCK_DATE_KEY);
      return last !== todayKey();
    } catch {
      return true; // storage error → don't block the user
    }
  };

  const markSharedUnlockToday = async (): Promise<void> => {
    try {
      await AsyncStorage.setItem(SHARE_UNLOCK_DATE_KEY, todayKey());
    } catch (err) {
      console.warn('[Pro] Failed to mark share-unlock:', err);
    }
  };

  return (
    <ProContext.Provider
      value={{
        isPro,
        proExpiresAt,
        adsWatched,
        isWatchingAds,
        startAdChallenge,
        watchAd,
        cancelAdChallenge,
        resetProStatus,
        getProTimeRemaining,
        setProFromAdMob,
        canShareUnlockToday,
        markSharedUnlockToday,
      }}
    >
      {children}
    </ProContext.Provider>
  );
};

export const usePro = () => {
  const context = useContext(ProContext);
  if (context === undefined) {
    throw new Error('usePro must be used within a ProProvider');
  }
  return context;
};
