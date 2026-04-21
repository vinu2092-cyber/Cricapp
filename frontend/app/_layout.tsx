import React, { useEffect, useState, ErrorInfo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { ProProvider } from '../src/context/ProContext';
// Always import native AdMob for Android builds (web builds use stub via extension resolution)
import { AdMobProvider, useAdMob } from '../src/context/AdMobContext.native';
import { NotificationProvider } from '../src/context/NotificationContext';
import { InboxProvider } from '../src/context/InboxContext';
import { FireTailAlertProvider } from '../src/context/FireTailAlertContext';
import AnimatedGlowBorder from '../src/components/AnimatedGlowBorder'; // no longer used — kept import only if referenced elsewhere
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _AnimatedGlowBorderUnused = AnimatedGlowBorder;
import ErrorScreen from '../src/components/ErrorScreen';
import SplashScreen from '../src/components/SplashScreen';

// ──────────────────────────────────────────────────────────────────────
// v1.0.12 rev-3 — Release-build perf wins (from PERFORMANCE_AUDIT.md):
//
// 1. Silence console.log / console.warn in production. Each JS-console
//    call costs a ~2-5 ms JS→native bridge hop on old phones (Snapdragon
//    425/625). With 92 console.logs across the codebase firing on every
//    30s poll, this alone wastes ~30-80 ms per cycle. __DEV__ is
//    set to `false` in release builds, so this block only strips logs
//    when the APK is signed — Metro dev still shows full output.
// 2. `console.error` is DELIBERATELY preserved so Firebase Crashlytics /
//    Play Console can still surface crashes.
//
// ⚠️ rev-3.1 — REMOVED the cleanupOldCommentary() startup call. The
// commentary sync-on-open flow used by app/match/[id].tsx is backed by
// `CommentaryStorage.ts` (loadCommentary + mergeCommentary), NOT by
// `CommentaryDB.ts`. Keeping a defensive no-op here would only add
// cognitive load with zero actual benefit, so it's dropped to eliminate
// any doubt about impacting sync-on-open.
// ──────────────────────────────────────────────────────────────────────
if (!__DEV__) {
  // eslint-disable-next-line no-console, @typescript-eslint/no-empty-function
  console.log = () => {};
  // eslint-disable-next-line no-console, @typescript-eslint/no-empty-function
  console.warn = () => {};
  // eslint-disable-next-line no-console, @typescript-eslint/no-empty-function
  console.info = () => {};
  // eslint-disable-next-line no-console, @typescript-eslint/no-empty-function
  console.debug = () => {};
}

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

// Deep link handler: navigates to match detail when user taps a notification
function NotificationDeepLinkHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Handle notification tap when app is running (foreground/background)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.matchId) {
        console.log(`[DeepLink] Notification tapped, navigating to match: ${data.matchId}`);
        setTimeout(() => {
          router.push(`/match/${data.matchId}`);
        }, 300);
      } else if (data?.screen === 'inbox' || data?.type === 'admin-broadcast') {
        console.log('[DeepLink] Admin broadcast tapped, opening inbox');
        setTimeout(() => {
          router.push('/inbox');
        }, 300);
      }
    });

    // Handle notification that launched the app (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data;
        if (data?.matchId) {
          console.log(`[DeepLink] App launched from notification, navigating to match: ${data.matchId}`);
          setTimeout(() => {
            router.push(`/match/${data.matchId}`);
          }, 1000);
        } else if (data?.screen === 'inbox' || data?.type === 'admin-broadcast') {
          console.log('[DeepLink] App launched from admin broadcast, opening inbox');
          setTimeout(() => {
            router.push('/inbox');
          }, 1000);
        }
      }
    });

    return () => responseSubscription.remove();
  }, []);

  return <>{children}</>;
}

function AppOpenAdHandler({ children }: { children: React.ReactNode }) {
  const { showAppOpenAd, isAdMobInitialized, isPro } = useAdMob();
  const [adShown, setAdShown] = useState(false);

  useEffect(() => {
    // Show App Opening Ad only once when SDK is initialized
    // Skip for Pro users
    if (isAdMobInitialized && !adShown && !isPro) {
      console.log('[AppOpenAdHandler] SDK ready, showing App Open Ad...');
      // Set flag IMMEDIATELY to prevent duplicate calls from re-renders
      // (showAppOpenAd reference changes every render since it's not memoized)
      setAdShown(true);
      showAppOpenAd()
        .then(() => console.log('[AppOpenAdHandler] App Open Ad flow complete'))
        .catch((err) => console.log('[AppOpenAdHandler] App Open Ad error:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdMobInitialized, adShown, isPro]);

  return <>{children}</>;
}

function AppWithSplash() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  useEffect(() => {
    // v1.0.11 (2026-04-21 perf fix) — native splash reduced from 1800ms to
    // 600ms. On old phones the prior 1.8s + 2.5s = 4.3s forced splash wait
    // stacked on top of JS warmup + first API fetch made the app feel
    // frozen for 8-10s on cold start. 600ms is enough for the native splash
    // to render one frame and hand off to React; the total splash time is
    // now 1.4s which is well below the 2s "instant" threshold users expect.
    const nativeSplashTimer = setTimeout(() => {
      ExpoSplashScreen.hideAsync().catch(() => {});
      setNativeSplashHidden(true);
    }, 600);

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
        // v1.0.11 perf fix — custom splash shortened from 2500ms to 800ms
        // to give old phones a faster time-to-interactive. The branded
        // splash image still displays, just for less time.
        duration={800}
      />
    );
  }

  return (
    <AppOpenAdHandler>
      <NotificationDeepLinkHandler>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </NotificationDeepLinkHandler>
    </AppOpenAdHandler>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <ProProvider>
        <AdMobProvider>
          <NotificationProvider>
            <InboxProvider>
              <FireTailAlertProvider>
                <StatusBar style="light" translucent />
                <AppWithSplash />
              </FireTailAlertProvider>
            </InboxProvider>
          </NotificationProvider>
        </AdMobProvider>
      </ProProvider>
    </AppErrorBoundary>
  );
}
