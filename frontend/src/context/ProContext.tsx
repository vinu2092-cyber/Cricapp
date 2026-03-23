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
}

const ProContext = createContext<ProContextType | undefined>(undefined);

const PRO_STORAGE_KEY = 'crickapp_pro_status';
const PRO_EXPIRY_KEY = 'crickapp_pro_expiry';
const ADS_REQUIRED = 3;
const PRO_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

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
