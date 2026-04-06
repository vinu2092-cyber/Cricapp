import React, { useEffect, useState, ErrorInfo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { ProProvider } from '../src/context/ProContext';
// Use native AdMob for Android/iOS, web stub for web
import { AdMobProvider, useAdMob } from '../src/context/AdMobContext.native';
import { NotificationProvider } from '../src/context/NotificationContext';
import AnimatedGlowBorder from '../src/components/AnimatedGlowBorder';
import ErrorScreen from '../src/components/ErrorScreen';
import SplashScreen from '../src/components/SplashScreen';

// Hide native splash when ready
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App Error Boundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          onGoBack={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function AppOpenAdHandler({ children }: { children: React.ReactNode }) {
  const { showAppOpenAd, isAdMobInitialized } = useAdMob();

  useEffect(() => {
    if (isAdMobInitialized) {
      showAppOpenAd().catch(() => {});
    }
  }, [isAdMobInitialized]);

  return <>{children}</>;
}

function AppWithSplash() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  useEffect(() => {
    // Show native splash for 1.5-2 seconds before hiding
    const nativeSplashTimer = setTimeout(() => {
      ExpoSplashScreen.hideAsync().catch(() => {});
      setNativeSplashHidden(true);
    }, 1800); // 1.8 seconds for native splash

    return () => clearTimeout(nativeSplashTimer);
  }, []);

  // Don't show custom splash until native splash is hidden
  if (!nativeSplashHidden) {
    return null;
  }

  if (showCustomSplash) {
    return (
      <SplashScreen
        onFinish={() => setShowCustomSplash(false)}
        duration={2500}
      />
    );
  }

  return (
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
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <ProProvider>
        <AdMobProvider>
          <NotificationProvider>
            <StatusBar style="light" translucent />
            <AppWithSplash />
          </NotificationProvider>
        </AdMobProvider>
      </ProProvider>
    </AppErrorBoundary>
  );
}
