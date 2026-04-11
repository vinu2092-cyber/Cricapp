# CricApp - PRD & Progress Tracker

## Original Problem Statement
Android native cricket live score app (React Native / Expo). Main issue: Rewarded Ads not showing when "Unlock" button is pressed. App already on Play Store (closed testing, 2nd version). Need to fix rewarded ads and push 3rd version update.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with TypeScript
- **Backend**: FastAPI Python
- **Ads**: AdMob (react-native-google-mobile-ads v14.11.0) + Unity Ads Mediation
- **Build**: EAS Build (Expo Application Services)
- **Package**: com.cricapp.live

## Core Requirements
- Live cricket scores
- Banner Ads, App Open Ads, Interstitial Ads (all working)
- Rewarded Ads for Pro unlock (was broken, NOW FIXED)
- Unity Ads mediation via AdMob

## What's Been Implemented (2026-04-11)

### Rewarded Ads Fix
**Root Cause**: Singleton pattern in `AdMobContext.native.tsx` was broken.
- Module-level `rewardedAdInstance` was reassigned after ad close, but event listeners stayed on OLD instance
- New instance had no listeners -> `isRewardedAdReady` never became `true` -> "Ad Not Available"

**Fix Applied**:
- Replaced module-level singleton with `useRef` pattern (`rewardedAdRef`, `rewardedListenersRef`)
- Created `setupAndLoadRewardedAd()` function that creates fresh instance + registers fresh listeners each time
- On ad CLOSE: Properly recreates instance with fresh listeners via `setupAndLoadRewardedAd()`
- On ERROR: Retries on same instance (listeners still attached)
- On-demand fallback also uses `setupAndLoadRewardedAd()` for post-show reload

**Files Changed**:
1. `frontend/src/context/AdMobContext.native.tsx` - Rewarded ad logic fix
2. `frontend/app.json` - version 1.0.3, versionCode 3
3. `frontend/android/app/build.gradle` - versionCode 3, versionName 1.0.3

**Files NOT Changed**: Everything else - Banner, Interstitial, App Open, ProContext, UI, etc.

## Ad Unit IDs
- App Open: ca-app-pub-9675798593675825/4826782503
- Interstitial: ca-app-pub-9675798593675825/8438724452
- Banner: ca-app-pub-9675798593675825/8616886104
- Rewarded: ca-app-pub-9675798593675825/6702740458
- Unity Game ID: 6087835

## Build & Deploy
- EAS Build profile: `production` for AAB, `preview` for APK
- Play Store: closed testing track
- Version: 1.0.3 (versionCode 3)

## Backlog
- P0: Verify rewarded ads work on real device after EAS build
- P1: Monitor AdMob dashboard for rewarded ad requests
- P2: Consider removing `requestNonPersonalizedAdsOnly: true` for better fill rates
