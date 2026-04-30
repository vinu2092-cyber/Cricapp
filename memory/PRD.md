# CricApp — v1.0.15 PRD

## Original Problem Statement (verbatim)
Clone https://github.com/vinu2092-cyber/Cricapp.git. Version 1.0.15 par GitHub pe build push karna. App Play Store par live hai — koi breaking change nahi. Screenshot ke basis par ads fix karne hain:
1. AdMob report mein request vs impression ka gap bahut zyada
2. Ads loading fast, requests waste nahi jaani chahiye
3. Banner2 ko touch nahi karna
4. Interstitial mein bhi requests waste
5. Unlock Pro mein 3 ads → 1 ad (button text bhi "1 ad")
6. Pichli triggered build (v1.0.15) fail ho gayi thi — verify aur fix
Extra: Share button Pro modal ke andar jo app link share karne par 30 min Pro free de. Share NAHI kiya to Pro NAHI mile.

## User Personas
- Free users (ads-supported): chahte hain teji se score aur commentary dekhe; tight data consumption
- Pro users (30-min unlock): ad-free, voice commentary, floating scoreboard
- Owner (user): AdMob revenue optimise karna (request/impression balance), app stability, Play Store live build

## Tech Stack
- React Native (Expo 54), expo-router 6
- `react-native-google-mobile-ads` 14.11.0 (NOT updated — stable)
- Node/Yarn, EAS (external builds only)
- Android versionCode 15 / version 1.0.15

## What's Been Implemented (v1.0.15 — 2026-04-30)

### Build fixes (pichli build ka fail reason)
- Removed `@react-native-firebase/app` plugin from `app.json` (listed but package not installed → prebuild fails)
- Restored `frontend/src/components/NativeAdCard.tsx` + `frontend/src/services/NativeAdRotator.ts` (accidentally deleted in commit 122addb, referenced by `match/[id].tsx`)

### AdMob request-waste fixes
- **Rewarded ad ID bug**: `AdMobContext.native.tsx` was using `6702740458` (wrong) — fixed to `6702704058` (matches app.json). Primary cause of UnlockProAd 66 req / 4 impr
- **App Open Ad**: show ONCE per app session; no auto-reload after CLOSED; error retries capped at 2 with 30s/60s back-off (was infinite 5s retries)
- **Interstitial Ad**: lazy-load — no preload at app init; prepare preload 3-5 clicks before threshold via `prepareInterstitialAd()`; no auto-reload after CLOSED; error retries capped at 2 with 30s/60s (was infinite 10s retries)
- **Rewarded Ad**: keeps init preload (fast Pro modal open), retry cap 3 (unchanged)
- **Banner2**: completely untouched ✅

### Unlock Pro UX (3 → 1 ad)
- `ProContext.tsx`: `ADS_REQUIRED` 3 → 1
- `AdModal.tsx`: 3 circles → 1 circle; texts "Watch 1 short video ad…", "Progress: x/1 ad watched", "Watch Ad 1 of 1"
- `app/index.tsx`: "/3 Ads Watched" → "/1 Ad Watched"
- `app/match/[id].tsx`: same fix

### Share-to-Unlock Pro (new feature)
- Single "Share" button inside Pro modal (`app/index.tsx` + `app/match/[id].tsx`)
- Opens native Android/iOS share sheet (WhatsApp, Telegram, Instagram, Facebook, Gmail, SMS — user picks)
- Shares Play Store link: https://play.google.com/store/apps/details?id=com.cricapp.live
- Pro unlocked (30 min) **only** on `Share.sharedAction` (native success signal)
- Dismissed share → no Pro (abuse prevention)

## Expected AdMob Impact
Before (from report):
- UnlockProAd: 66 req / 4 impr
- AppOpenAd: 27 req / 11 impr
- RandomInterstitial: 19 req / 1 impr
- Banner1: 17 req / 3 impr (match rate 29.41%)
- Banner2: 19 req / 14 impr ← KEPT AS-IS ✅

After:
- UnlockProAd: drop to ~real usage (impressions + share unlocks reduce dependence on rewarded)
- AppOpenAd: ~1-2 req/session (one-shot)
- RandomInterstitial: ~1-2 req (lazy)
- Banner1: same as before (no code touched in Banner components)
- Banner2: unchanged

## Prioritised Backlog
- P0: Push to GitHub `main` branch (user will do via Save to GitHub / git push — patch provided at /app/v1.0.15_ads_share_fix.patch)
- P1: Monitor AdMob next 24-48h — verify request/impression ratio improves
- P2: Future — consider A/B test between "Share to unlock" vs "Watch ad to unlock" for best conversion

## Files Modified
- frontend/app.json
- frontend/app/index.tsx
- frontend/app/match/[id].tsx
- frontend/src/components/AdModal.tsx
- frontend/src/context/AdMobContext.native.tsx
- frontend/src/context/AdMobContext.tsx
- frontend/src/context/ProContext.tsx
- frontend/src/components/NativeAdCard.tsx (restored)
- frontend/src/services/NativeAdRotator.ts (restored)

## Commit
- Branch: main
- SHA: 068046c40d43f8ff70142a2701cca7359191ab54
- Patch: /app/v1.0.15_ads_share_fix.patch
