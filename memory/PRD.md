# CricApp — v1.0.15 PRD

## Original Problem Statement (verbatim)
Clone https://github.com/vinu2092-cyber/Cricapp.git. Version 1.0.15 par GitHub pe build push karna. App Play Store par live hai — koi breaking change nahi. Ads fix (UnlockPro 3→1 ad, request waste reduce, Banner2 untouched), Share-to-Unlock Pro (1/day quota), GitHub Actions auto-build.

## What's Been Implemented (v1.0.15 — 2026-04-30)

### Build fixes
- Removed `@react-native-firebase/app` plugin from `frontend/app.json` (package not installed → prebuild fail)
- Restored `frontend/src/components/NativeAdCard.tsx` + `frontend/src/services/NativeAdRotator.ts` (deleted in 122addb)
- Updated `.github/workflows/build-android.yml` release tag → `v1.0.15`

### AdMob request-waste fixes
- Rewarded ad ID fix: `6702740458` → `6702704058` (matches app.json) — cause of UnlockProAd 66 req/4 impr
- App Open Ad: ONCE per session, no auto-reload, retries cap 2 (30s/60s)
- Interstitial Ad: lazy-load (preload threshold-5 clicks before), no auto-reload, retries cap 2
- Rewarded Ad: keeps init preload
- Banner2 untouched ✅

### Unlock Pro 3 → 1 ad (all surfaces)
- `ProContext` ADS_REQUIRED 3→1; AdModal, index.tsx, match/[id].tsx texts updated

### Share-to-Unlock Pro (viral growth, 1/day quota)
- Single share button → native RN `Share.share()` → Android ACTION_SEND intent (shows WhatsApp, Telegram, Instagram, Facebook, Gmail, SMS — all share-compatible apps)
- Play Store link: https://play.google.com/store/apps/details?id=com.cricapp.live
- Pro only on `Share.sharedAction` (native success). Dismiss → no Pro.
- Daily quota: 1 per device per day via AsyncStorage `crickapp_share_unlock_date` (YYYY-MM-DD local date). New ProContext APIs: `canShareUnlockToday()`, `markSharedUnlockToday()`

### Folder layout fix (for Save to GitHub)
- Moved Cricapp repo contents to `/app` root (from `/app/Cricapp/` nested clone) so Emergent "Save to GitHub" correctly pushes to user's Cricapp GitHub repo
- GitHub Actions workflow at `/app/.github/workflows/build-android.yml` → triggers `on: push: branches: [main]` → APK + AAB build auto-runs on push

## Files Modified
- .github/workflows/build-android.yml
- frontend/app.json
- frontend/app/index.tsx
- frontend/app/match/[id].tsx
- frontend/src/components/AdModal.tsx
- frontend/src/components/NativeAdCard.tsx (restored)
- frontend/src/services/NativeAdRotator.ts (restored)
- frontend/src/context/AdMobContext.native.tsx
- frontend/src/context/AdMobContext.tsx
- frontend/src/context/ProContext.tsx

## Version
- `version: 1.0.15`, `versionCode: 15`
- `react-native-google-mobile-ads: 14.11.0` (stable, not updated)

## Next Steps
- P0: User clicks "Save to GitHub" → pushes /app → GitHub Actions auto-triggers → APK + AAB build
- P1: Monitor AdMob 24-48h — request/impression ratio should improve
- P2: Referral link with per-user attribution (future)
