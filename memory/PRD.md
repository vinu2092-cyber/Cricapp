# CricApp - PRD & Progress Tracker

## Original Problem Statement
Android native cricket live score app (React Native / Expo). Main issue: Rewarded Ads not showing when "Unlock" button is pressed. Need to fix rewarded ads, enable personalized ads with UMP consent, and push 3rd version update.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with TypeScript
- **Backend**: FastAPI Python
- **Ads**: AdMob (react-native-google-mobile-ads v14.11.0) + Unity Ads Mediation
- **Build**: EAS Build (Expo Application Services)
- **Package**: com.cricapp.live

## Core Requirements
- Live cricket scores
- Banner Ads, App Open Ads, Interstitial Ads (all working)
- Rewarded Ads for Pro unlock (FIXED)
- Unity Ads mediation via AdMob
- UMP Consent for personalized ads (IMPLEMENTED)

## What's Been Implemented

### Session 1 (2026-04-11): Rewarded Ads Fix
**Root Cause**: Singleton pattern in `AdMobContext.native.tsx` was broken - module-level `rewardedAdInstance` was reassigned after ad close but event listeners stayed on OLD instance.
**Fix**: Replaced with ref-based pattern (`rewardedAdRef` + `setupAndLoadRewardedAd()`) that creates fresh instance + fresh listeners each time.

### Session 2 (2026-04-11): Personalized Ads + UMP Consent
1. **Removed `requestNonPersonalizedAdsOnly: true`** from all 6 ad request locations (Rewarded, Interstitial, App Open, Banner, On-demand variants)
2. **Integrated UMP Consent Flow** using `AdsConsent` API from react-native-google-mobile-ads:
   - `AdsConsent.requestInfoUpdate()` on app launch
   - `AdsConsent.loadAndShowConsentFormIfRequired()` for EEA users
   - `AdsConsent.getConsentInfo()` to verify consent status
   - `showPrivacyOptionsForm()` available in context for future use
3. **GDPR message already published** in AdMob console by user

**Files Changed (Total)**:
1. `frontend/src/context/AdMobContext.native.tsx` - Rewarded fix + UMP consent + personalized ads
2. `frontend/src/context/AdMobContext.tsx` - type sync (web stub)
3. `frontend/src/context/AdMobContext.web.tsx` - type sync (web stub)
4. `frontend/app.json` - version 1.0.3, versionCode 3
5. `frontend/android/app/build.gradle` - versionCode 3, versionName 1.0.3

**Files NOT Changed**: settings.tsx, index.tsx, ProContext, Header, AdModal, all Android native files, all plugins, etc.

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
- P0: Build APK/AAB via EAS and test on real device
- P1: Verify consent form appears for EEA users
- P2: Monitor AdMob dashboard for rewarded ad fill rates with personalized ads
