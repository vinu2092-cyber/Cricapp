# CricApp - PRD & Progress Tracker

## Original Problem Statement
Android native cricket app. Issues: Rewarded Ads not loading, Recent Overs wrong W markers.

## ROOT CAUSE FOUND: Wrong Ad Unit ID!
- **Code had:** `ca-app-pub-9675798593675825/6702740458` (WRONG - digits transposed)
- **AdMob Console:** `ca-app-pub-9675798593675825/6702704058` (CORRECT)
- Difference: `...70**40**58` vs `...74**04**58` → digits swapped!
- This caused ALL rewarded ad requests to fail because Google couldn't find the ad unit

## All Fixes Applied
1. **Ad Unit ID FIXED** → `6702704058` (correct, matching AdMob console)
2. **Singleton pattern fixed** → ref-based with fresh listeners after each ad close
3. **W = Wide fix** → In Recent Overs, `W` shown as orange wide, `WKT` as red wicket
4. **Personalized ads** → `requestNonPersonalizedAdsOnly` removed
5. **UMP Consent** → Added on app launch (v14.x compatible)
6. **Version 1.0.3** (versionCode 3) for Play Store
7. **NO test ad code** - all removed per user request

## Files Changed
1. `AdMobContext.native.tsx` - All ad fixes
2. `AdMobContext.tsx` / `AdMobContext.web.tsx` - type sync
3. `match/[id].tsx` - W=Wide fix
4. `app.json` + `build.gradle` - version 1.0.3

## NOT Changed
settings.tsx, index.tsx, ProContext, api.ts, Header, plugins, Android native files
