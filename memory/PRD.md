# CricApp - PRD & Progress Tracker

## Original Problem Statement
Android native cricket live score app (React Native / Expo). Issues: Rewarded Ads not loading, Recent Overs showing wrong wicket markers, need personalized ads with UMP consent.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with TypeScript
- **Backend**: FastAPI Python
- **Ads**: AdMob (react-native-google-mobile-ads v14.11.0) + Unity Ads Mediation
- **Data**: Cricbuzz RapidAPI
- **Build**: EAS Build
- **Package**: com.cricapp.live

## What's Been Implemented

### Rewarded Ads Fix (Session 1)
- Fixed broken singleton pattern → ref-based pattern with `setupAndLoadRewardedAd()`

### Personalized Ads + UMP Consent (Session 2)
- Removed `requestNonPersonalizedAdsOnly: true` from all ad locations
- Added UMP consent flow

### Recent Overs Fix + Diagnostics (Session 3-4)
**Bug: W = Wide, not Wicket**
- Cricbuzz `recentOvsStr` uses `W` for WIDE. Code was showing as RED wicket.
- Fix: `W` → orange "WD" (wide), `WKT`/`OUT` → red "W" (wicket)

**Rewarded Ad Deep Diagnostic**
- Added `tryTestRewardedAd()` - loads Google's official test ad (`ca-app-pub-3940256099942544/5224354917`)
- On error, user sees actual error code + "Try Test Ad" button
- If test ad works → code is correct, issue is fill rate/ad unit config
- If test ad fails → SDK configuration issue
- Consent flow made v14.x compatible (publisher IDs fallback)
- Added try-catch wrapper around setupAndLoadRewardedAd
- Added exponential backoff retry

**Files Changed:**
1. `frontend/src/context/AdMobContext.native.tsx` - All ad fixes + diagnostics
2. `frontend/src/context/AdMobContext.tsx` - type sync
3. `frontend/src/context/AdMobContext.web.tsx` - type sync
4. `frontend/app/match/[id].tsx` - W=Wide fix in formatOverSummary
5. `frontend/app.json` - version 1.0.3, versionCode 3
6. `frontend/android/app/build.gradle` - versionCode 3, versionName 1.0.3

**NOT Changed:** settings.tsx, index.tsx, ProContext, api.ts, Header, plugins, Android native files

## Diagnostic Decision Tree
1. Click "Watch Ad" → If "Ad Not Available" with error code:
   - Click "Try Test Ad"
   - If TEST ad shows → Real ad unit has no fill (AdMob console issue)
   - If TEST ad fails → SDK/configuration issue
2. Check error codes:
   - Code 3 (No fill) → AdMob doesn't have ads for this unit/region
   - Code 1 (Invalid request) → Ad unit ID issue
   - Code 2 (Network) → Internet issue
   - "null-activity" → App lifecycle issue

## Backlog
- P0: Deploy and test diagnostic on device
- P1: Based on diagnostic results, fix either ad unit config or SDK issue
- P2: Consider rewarded interstitial as fallback
