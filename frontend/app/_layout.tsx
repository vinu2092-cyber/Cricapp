import React, { useEffect, ErrorInfo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { ProProvider } from '../src/context/ProContext';
import { AdMobProvider, useAdMob } from '../src/context/AdMobContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import AnimatedGlowBorder from '../src/components/AnimatedGlowBorder';
import ErrorScreen from '../src/components/ErrorScreen';

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
    // Hide splash + show App Open Ad
    ExpoSplashScreen.hideAsync().catch(() => {});
    if (isAdMobInitialized) {
      showAppOpenAd().catch(() => {});
    }
  }, [isAdMobInitialized]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <ProProvider>
        <AdMobProvider>
          <NotificationProvider>
            <StatusBar style="light" translucent />
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
          </NotificationProvider>
        </AdMobProvider>
      </ProProvider>
    </AppErrorBoundary>
  );
}
