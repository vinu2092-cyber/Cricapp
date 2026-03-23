import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProContextType {
  isPro: boolean;
  adsWatched: number;
  isWatchingAds: boolean;
  startAdChallenge: () => void;
  watchAd: () => void;
  cancelAdChallenge: () => void;
  resetProStatus: () => void;
}

const ProContext = createContext<ProContextType | undefined>(undefined);

const PRO_STORAGE_KEY = 'crickapp_pro_status';
const ADS_REQUIRED = 3;

export const ProProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(false);
  const [adsWatched, setAdsWatched] = useState(0);
  const [isWatchingAds, setIsWatchingAds] = useState(false);

  useEffect(() => {
    loadProStatus();
  }, []);

  const loadProStatus = async () => {
    try {
      const status = await AsyncStorage.getItem(PRO_STORAGE_KEY);
      if (status === 'true') {
        setIsPro(true);
      }
    } catch (error) {
      console.error('Error loading pro status:', error);
    }
  };

  const saveProStatus = async (status: boolean) => {
    try {
      await AsyncStorage.setItem(PRO_STORAGE_KEY, status.toString());
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

  const watchAd = () => {
    const newCount = adsWatched + 1;
    setAdsWatched(newCount);
    
    if (newCount >= ADS_REQUIRED) {
      setIsPro(true);
      setIsWatchingAds(false);
      saveProStatus(true);
    }
  };

  const cancelAdChallenge = () => {
    setIsWatchingAds(false);
    setAdsWatched(0);
  };

  const resetProStatus = async () => {
    setIsPro(false);
    setAdsWatched(0);
    await AsyncStorage.removeItem(PRO_STORAGE_KEY);
  };

  return (
    <ProContext.Provider
      value={{
        isPro,
        adsWatched,
        isWatchingAds,
        startAdChallenge,
        watchAd,
        cancelAdChallenge,
        resetProStatus,
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
