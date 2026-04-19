# CricApp — PRD & Fix Log

## Problem Statement (from user)
React Native/Expo Android app (CricApp) is live on Play Store Closed Testing. 
AdMob ads integrated: App Open, Interstitial, Rewarded, Banner. 
**Issue**: App Open Ad and Rewarded Ad are not showing to users → revenue zero. 
Banner & Interstitial work fine.

## Core Requirements
1. Restore App Open Ad and Rewarded Ad delivery.
2. Don't touch banner/interstitial (already working).
3. All changes must push directly to GitHub (`vinu2092-cyber/Cricapp`) — no EAS, no web preview. GitHub Actions builds APK/AAB automatically on push.
4. Work ONLY in the root directory tied to the GitHub repo (`/app`).
5. Don't break the existing working app.

## Architecture (Verified)
- **Frontend**: Expo 54 / React Native 0.81.5, expo-router v6, TypeScript
- **Ads**: `react-native-google-mobile-ads` 14.11.0 + UMP Consent
- **Package**: `com.cricapp.live`
- **App ID**: `ca-app-pub-9675798593675825~2399929714`
- **Build Pipeline**: GitHub Actions → assembleRelease + bundleRelease → upload APK+AAB + create release
- **Keystore**: Stored as `RELEASE_KEYSTORE_B64` GitHub secret

## Ad Unit IDs (Verified — DO NOT CHANGE)
| Type | Unit ID |
|------|---------|
| App Open | `ca-app-pub-9675798593675825/4826782503` |
| Interstitial | `ca-app-pub-9675798593675825/8438724452` |
| Banner | `ca-app-pub-9675798593675825/8616886104` |
| Rewarded | `ca-app-pub-9675798593675825/6702704058` |

## Fix History

### 2026-04-19 — v1.0.11 (current) — AdMob Ads Restore
- **Root cause**: v1.0.10 introduced 4 bugs in `AdMobContext.native.tsx` (aggressive parallel loads, same-instance reload, orphan App Open preload, 1s rate-limit retry).
- **Fix**: Reverted `AdMobContext.native.tsx` to v1.0.8 proven working pattern. Fixed `_layout.tsx` race condition. Bumped version to 1.0.11.
- **Files changed**: `frontend/src/context/AdMobContext.native.tsx`, `frontend/app/_layout.tsx`, `frontend/app.json`, `.github/workflows/build-android.yml`, `ADMOB_FIX_v1.0.11.md`
- **Status**: Pushed → GitHub Actions build → APK/AAB. User must test on device with `adb logcat | grep AdMob` to verify ads loading.

### Previous attempts (not by me — documented for context)
- v1.0.10 ADMOB_FIX_SUMMARY.md claims package name fix + APPLICATION_ID injection. Those WERE correct changes and are preserved. But the parallel AdMob logic tweaks INTRODUCED the current bugs.

## Next Action Items
1. **User**: Click "Save to GitHub" → wait for Actions build (~7-10 min) → install APK on device.
2. **User**: Capture `adb logcat | grep -E "AdMob|AppOpen"` for 60s after app launch and share if ads still don't show.
3. **Verify in AdMob Console** (1–2 hours after install): App Open + Rewarded impressions > 0.

## Backlog / Future
- Consider moving App Open Ad to a proper preload-and-cache pattern (store `AppOpenAd` in a ref, show cached on app foreground resume).
- Add eCPM floor monitoring in AdMob console.
- Consider mediation waterfall (Meta Audience Network, AppLovin) if AdMob fill remains low.

## 2026-04-19 Update — User shared AdMob screenshots

### Additional Root Causes Discovered (from AdMob console)
1. **eCPM floor $2.00** set on both AppOpenAd and UnlockProAd (Rewarded) — blocks 90%+ ads in low-CPM markets (India etc). This is the PRIMARY reason ads stopped showing even after code fix.
2. **AppOpenAd has 0 active mediation groups** (other ads have 1) — may contribute to lower fill.
3. Ad Activity Report confirms: match rate crashed from 100% → 0% on April 17 (same day buggy code pushed).

### User Decision
- Keep version at **1.0.10 / versionCode 10** (reverted from my 1.0.11 bump).
- User will upload this to Play Store Closed Testing.

### Action Items for User
1. Lower eCPM floor on AppOpenAd and UnlockProAd from $2 to $0.10 (or disable)
2. Remove/lower 246 country-specific eCPM floors
3. (Optional) Create mediation group for App open format
4. Click "Save to GitHub" to trigger build #102+ with fixed code
5. Install APK and verify via `adb logcat | grep AdMob`

See `/app/ADMOB_CONSOLE_FIX_REQUIRED.md` for full details.

## 2026-04-19 18:20 — Build #101 Successfully Pushed & Built

- Commit `6f8a5e7` (my final commit) pushed to GitHub successfully after user re-clicked Save to GitHub
- GitHub Actions build #101 completed in 7m 44s
- APK (39.1 MB) and AAB (40.1 MB) artifacts generated successfully
- User has confirmed: App Open, Banner, Interstitial ads now working after eCPM floor fix to "Google optimised"
- Rewarded ad still failing in OLD v1.0.10 APK on user's device — but new APK from build #101 has the v1.0.8 pattern code fix
- **Next**: User to download APK from build #101 artifacts, install on phone, test Rewarded ad

## Expected outcome
- Rewarded ad should load within 3-5 seconds of app launch (pre-load pattern)
- On failure, 5-30s randomized backoff with FRESH instance (not aggressive 1s retry that triggered AdMob rate-limit)
- No more 3x parallel load storm at 0s/3s/8s
- No more same-failed-instance reload (creates fresh RewardedAd.createForAdRequest each time)
