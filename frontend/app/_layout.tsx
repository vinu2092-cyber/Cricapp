import React, { useEffect, useState, ErrorInfo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { ProProvider } from '../src/context/ProContext';
import { AdMobProvider, useAdMob } from '../src/context/AdMobContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import AnimatedGlowBorder from '../src/components/AnimatedGlowBorder';
import SplashScreen from '../src/components/SplashScreen';
import ErrorScreen from '../src/components/ErrorScreen';

// Keep Expo native splash visible until we're ready
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

// Error Boundary to prevent full app crash
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
    console.error('App Error Boundary caught:', error, info);
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

// Component to handle App Open Ad on launch
function AppOpenAdHandler({ children }: { children: React.ReactNode }) {
  const { showAppOpenAd, isAdMobInitialized } = useAdMob();

  useEffect(() => {
    if (isAdMobInitialized) {
      showAppOpenAd().catch(() => {});
    }
  }, [isAdMobInitialized]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = () => {
    setShowSplash(false);
    ExpoSplashScreen.hideAsync().catch(() => {});
  };

  return (
    <AppErrorBoundary>
      <ProProvider>
        <AdMobProvider>
          <NotificationProvider>
            <StatusBar style="light" translucent />
            {showSplash ? (
              <SplashScreen onFinish={handleSplashFinish} />
            ) : (
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
            )}
          </NotificationProvider>
        </AdMobProvider>
      </ProProvider>
    </AppErrorBoundary>
  );
}
