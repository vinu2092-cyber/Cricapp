# CricApp - PRD & Progress Tracker

## Original Problem Statement
Android native cricket live score app (React Native / Expo). Issues: Rewarded Ads not loading, Recent Overs showing wrong wicket markers, need personalized ads with UMP consent.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with TypeScript
- **Backend**: FastAPI Python (for any server-side needs)
- **Ads**: AdMob (react-native-google-mobile-ads v14.11.0) + Unity Ads Mediation
- **Data**: Cricbuzz RapidAPI (unofficial)
- **Build**: EAS Build (Expo Application Services)
- **Package**: com.cricapp.live

## What's Been Implemented

### Session 1: Rewarded Ads Singleton Fix
- Root Cause: Module-level singleton rewardedAdInstance reassigned after close but listeners stayed on old instance
- Fix: Ref-based pattern with `setupAndLoadRewardedAd()` that creates fresh instance + listeners

### Session 2: Personalized Ads + UMP Consent
- Removed `requestNonPersonalizedAdsOnly: true` from all 6 ad locations
- Added UMP consent flow (AdsConsent API) before SDK init
- GDPR message published in AdMob console

### Session 3: Recent Overs Fix + Better Ad Diagnostics
**Bug: Wrong Wicket Markers (W)**
- Root Cause: Cricbuzz `recentOvsStr` uses `W` for WIDE (not wicket!), but code treated `W` as RED wicket
- Evidence: Score 77/1 (1 wicket) but Recent Overs showed 2 red `W` markers = impossible
- Fix: `W` → orange "WD" (wide), only `WKT`/`OUT`/`WICKET` → red "W" (real wicket)

**Improved Rewarded Ad Diagnostics**
- Error alerts now show actual AdMob error code and message
- Consent flow split into non-blocking steps (consent failure won't prevent SDK init)
- Better logging for debugging fill rate issues

**Files Changed (Total)**:
1. `frontend/src/context/AdMobContext.native.tsx` - Rewarded fix + UMP consent + error diagnostics
2. `frontend/src/context/AdMobContext.tsx` - type sync (web stub)
3. `frontend/src/context/AdMobContext.web.tsx` - type sync (web stub)
4. `frontend/app/match/[id].tsx` - formatOverSummary W=Wide fix
5. `frontend/app.json` - version 1.0.3, versionCode 3
6. `frontend/android/app/build.gradle` - versionCode 3, versionName 1.0.3

**Files NOT Changed**: settings.tsx, index.tsx, ProContext, api.ts, Header, plugins, Android native files

## Ad Unit IDs
- App Open: ca-app-pub-9675798593675825/4826782503
- Interstitial: ca-app-pub-9675798593675825/8438724452
- Banner: ca-app-pub-9675798593675825/8616886104
- Rewarded: ca-app-pub-9675798593675825/6702740458
- Unity Game ID: 6087835

## Build & Deploy
- EAS Build: `preview` (APK), `production` (AAB)
- Play Store: closed testing track
- Version: 1.0.3 (versionCode 3)

## Backlog
- P0: Build APK/AAB and test both fixes on device
- P1: Check actual error code from rewarded ad on device (displayed in new error dialog)
- P2: If error is "No fill" (code 3), check AdMob mediation configuration
- P3: Consider adding rewarded interstitial as fallback ad format
