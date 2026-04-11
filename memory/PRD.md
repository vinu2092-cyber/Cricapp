# CricApp - Production Ready PRD

## Status: PRODUCTION BUILD READY

## Version Info
- **Version Name:** 1.0.2
- **Version Code:** 2
- **Package:** com.cricapp.live

## Real AdMob IDs (Production)

| Ad Type | Ad Unit ID |
|---------|------------|
| App ID | ca-app-pub-9675798593675825~2399929714 |
| App Open | ca-app-pub-9675798593675825/4826782503 |
| Banner | ca-app-pub-9675798593675825/8616886104 |
| Interstitial | ca-app-pub-9675798593675825/8438724452 |
| Rewarded | ca-app-pub-9675798593675825/6702740458 |

## Changes Made for Production

1. Test Ad IDs replaced with Real Ad IDs
2. Test Device ID removed
3. Version updated to 1.0.2
4. Version Code set to 2
5. app-ads.txt created

## Keystore Info
- File: release-keystore.jks
- Password: CricApp2026Release
- Alias: cricapp-release

## V2 Bug Fixes (Feb 2026)

### Fix 1: Overlay + Unlock Button Merge
- Removed separate "Unlock" button from match header
- Overlay (layers) button now gates non-pro users through Pro Modal (rewarded ad flow)
- Pro users get direct overlay toggle
- Files: `app/match/[id].tsx`

### Fix 2: Rewarded Ad - COMPLETE REWRITE
**Root cause**: `loadingRef.current` was getting permanently stuck at `true` because neither LOADED nor ERROR event callbacks fired from the native bridge. This caused:
- All retry attempts to be silently skipped
- Health check to skip (checked `!loadingRef.current`)
- Zero ad requests reaching Google AdMob

**Three critical fixes applied:**
1. **Loading timeout (12s)**: If neither LOADED nor ERROR fires within 12 seconds, `loadingRef.current` is force-reset and retry scheduled
2. **On-demand fallback**: When user clicks "Watch Ad" and no preloaded ad exists, creates a NEW RewardedAd on-the-fly, loads it, and shows it immediately (15s timeout) - same pattern as interstitial fallback
3. **Health check fix**: Health check now force-resets stuck `loadingRef.current = true` before attempting preload
4. **Button always clickable**: "Watch Ad" button no longer shows "Loading Ad..." disabled state - always clickable with on-demand loading
- Files: `src/context/AdMobContext.native.tsx`, `app/match/[id].tsx`

### Fix 3: Scoreboard Compact UI
- Reduced score header padding, font sizes, and margins
- Team score: 22px -> 18px, batsmen name/score smaller
- Over summary section more compact
- Files: `app/match/[id].tsx`

### Fix 4: About Button Moved to Settings
- Removed About button from Footer (was hidden behind phone nav bar)
- Added "About CricApp" section in Settings screen
- Footer now just decorative grass bar (30px)
- Files: `src/components/Footer.tsx`, `app/settings.tsx`

## Architecture
- Frontend: React Native, Expo Router, Expo Config Plugins
- Backend: External RapidAPI (Cricbuzz) - No local DB
- Native Android: Foreground Services (SYSTEM_ALERT_WINDOW) via Java Bridge
- CI/CD: GitHub Actions for release AAB builds

## Completed Features
- Live/Recent/Upcoming match listings with category filters
- Match detail with commentary, cricket field visualization
- Floating Scoreboard (in-app + native overlay)
- Voice Commentary (TTS)
- Push Notifications for match events
- Google AdMob (App Open, Banner, Interstitial, Rewarded)
- Pro unlock via 3 rewarded ads (30-min access)
- GitHub Actions CI/CD for AAB builds
- Play Store production readiness
