import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ProProvider } from '../src/context/ProContext';
import { AdMobProvider, useAdMob } from '../src/context/AdMobContext';
import AnimatedGlowBorder from '../src/components/AnimatedGlowBorder';

// Component to handle App Open Ad on launch
function AppOpenAdHandler({ children }: { children: React.ReactNode }) {
  const { showAppOpenAd, isAdMobInitialized } = useAdMob();

  useEffect(() => {
    // Show App Open Ad when app launches (for ALL users - Pro and non-Pro)
    if (isAdMobInitialized) {
      showAppOpenAd();
    }
  }, [isAdMobInitialized]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ProProvider>
      <AdMobProvider>
        <StatusBar style="light" />
        <AppOpenAdHandler>
          <AnimatedGlowBorder>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
          </AnimatedGlowBorder>
        </AppOpenAdHandler>
      </AdMobProvider>
    </ProProvider>
  );
}
