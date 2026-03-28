# CricApp - Product Requirements Document

## Original Problem Statement
Cricket live score app (React Native Expo for Android) with issues:
1. Floating draggable pop-up scoreboard too small - scores not visible
2. Match data not loading in the app
3. Previous agents broke basic UI when fixing issues
4. Need APK and AAB builds with minimized size
5. AdMob ads integration for Pro unlock system

## Architecture
- **Frontend**: React Native (Expo SDK 54) - Android-only mobile app
- **Backend**: FastAPI proxy to Cricbuzz via RapidAPI (multiple API keys with rotation)
- **Database**: MongoDB (for status checks)
- **Ads**: Google AdMob (react-native-google-mobile-ads)
- **Build**: EAS Build (Expo Application Services)

## User Personas
- Cricket fans wanting live scores on their Android phones
- Users who want floating scoreboard overlay while using other apps
- Free users (see ads) vs Pro users (30-min ad-free after watching 3 rewarded ads)

## Core Requirements
1. Live, Recent, Upcoming match listings with category filters
2. Match detail with cricket field, commentary, scores
3. Floating draggable scoreboard (Pro feature)
4. Voice commentary (Pro feature)
5. AdMob monetization (App Open, Banner, Interstitial every 10-15 clicks, Rewarded for Pro)
6. Pro system: Watch 3 rewarded ads → 30 min Pro access
7. SYSTEM_ALERT_WINDOW permission for overlay

## What's Been Implemented (March 28, 2026)
- [x] Fixed data loading: Rewrote index.tsx extractMatches to produce proper Match type objects
- [x] Fixed getBackendUrl export from api.ts
- [x] Fixed category filter (uses match.category instead of match.matchFormat)
- [x] Fixed navigation (uses matchId instead of id)
- [x] Fixed Header component (onUnlockPro made optional)
- [x] Fixed ErrorScreen (added onRetry support)
- [x] Fixed FloatingScoreboard size (minWidth 230, bigger fonts, always shows both teams)
- [x] Added doodle wallpaper background to home page (ImageBackground)
- [x] Added Pro unlock modal to home page
- [x] Fixed Pro button flow (opens modal instead of alert)
- [x] Added "Overlay ON/OFF" button alongside "Floating Score"
- [x] Integrated real AdMob SDK (react-native-google-mobile-ads v16.3.1)
- [x] Added SYSTEM_ALERT_WINDOW permission
- [x] Updated Expo account (cricapp-1) and project ID
- [x] Optimized image assets for smaller APK
- [x] Started EAS builds (APK + AAB)

## Build Details
- **Expo Account**: cricapp-1 (tempcp23@gmail.com)
- **Project**: @cricapp-1/cric-app
- **Project ID**: 2e891145-de46-4415-841e-67271e25a146
- **APK Build**: 60eeac97-f68d-4ecf-93b5-9472224c37b5
- **AAB Build**: 88e3e2da-266f-447e-8a45-bd921e824728
- **Build Dashboard**: https://expo.dev/accounts/cricapp-1/projects/cric-app/builds

## AdMob Configuration
- App ID: ca-app-pub-9675798593675825~2399929714
- App Open: ca-app-pub-9675798593675825/4826782503
- Interstitial: ca-app-pub-9675798593675825/8438724452
- Banner: ca-app-pub-9675798593675825/8616886104
- Rewarded: ca-app-pub-9675798593675825/6702740458

## API Keys (RapidAPI - Cricbuzz)
- 10 API keys with rotation system
- 2 providers for fallback
- Backend URL: https://dragable-ui-test.preview.emergentagent.com

## Prioritized Backlog
### P0 (Critical)
- [x] Data loading fix
- [x] AdMob real integration
- [x] Build APK/AAB

### P1 (Important)
- [ ] Native FloatingScoreService.java for true home screen overlay
- [ ] Test innings handling for Test matches (show latest innings)

### P2 (Nice to have)
- [ ] Push notifications for live score updates
- [ ] Widget for home screen
- [ ] Multi-language support beyond English/Hindi

## Next Tasks
1. Download APK from build dashboard and test on device
2. Download AAB and upload to Play Store
3. Push code to GitHub using "Save to Github" feature
4. Test AdMob ads on real device
5. Consider native overlay service for home screen
