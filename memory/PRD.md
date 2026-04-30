# CricApp — v1.0.15 PRD

## Original Problem Statement (verbatim)
Clone https://github.com/vinu2092-cyber/Cricapp.git. Version 1.0.15 par GitHub pe build push karna. App Play Store par live hai — koi breaking change nahi. Screenshot ke basis par ads fix karne hain:
1. AdMob report mein request vs impression ka gap bahut zyada
2. Ads loading fast, requests waste nahi jaani chahiye
3. Banner2 ko touch nahi karna
4. Interstitial mein bhi requests waste
5. Unlock Pro mein 3 ads → 1 ad (button text bhi "1 ad")
6. Pichli triggered build (v1.0.15) fail ho gayi thi — verify aur fix

Follow-up requirements:
- Share button inside Unlock Pro that grants 30 min Pro free when user actually shares Play Store link
- Single share button that opens native share intent (WhatsApp, Telegram, Instagram, Facebook, Gmail, SMS — any app user chooses)
- **Daily limit: 1 share-unlock per day**. After that, user must watch ad. Protects AdMob revenue, enables virality.
- GitHub Actions should auto-trigger APK/AAB build on push to main

## User Personas
- Free users (ads-supported): chahte hain teji se score aur commentary dekhe; tight data consumption
- Pro users (30-min unlock): ad-free, voice commentary, floating scoreboard
- Owner (user): AdMob revenue optimise karna (request/impression balance), app stability, Play Store live build, viral growth

## Tech Stack
- React Native (Expo 54), expo-router 6
- `react-native-google-mobile-ads` 14.11.0 (NOT updated — stable)
- Node/Yarn, GitHub Actions for APK/AAB build (auto-trigger on push to main)
- Android versionCode 15 / version 1.0.15

## What's Been Implemented (v1.0.15 — 2026-04-30)

### Build fixes (pichli build ka fail reason)
- Removed `@react-native-firebase/app` plugin from `app.json` (listed but package not installed → prebuild fails)
- Restored `frontend/src/components/NativeAdCard.tsx` + `frontend/src/services/NativeAdRotator.ts` (accidentally deleted in commit 122addb, referenced by `match/[id].tsx`)
- Updated `.github/workflows/build-android.yml` release tag → `v1.0.15` with new release notes

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

### Share-to-Unlock Pro (viral growth feature)
- Single "Share" button inside Pro modal (`app/index.tsx` + `app/match/[id].tsx`)
- Uses React Native's `Share.share()` → native Android `ACTION_SEND` intent — shows ALL installed share-compatible apps (WhatsApp, Telegram, Instagram, Facebook, Gmail, SMS, etc.)
- Shares Play Store link: https://play.google.com/store/apps/details?id=com.cricapp.live
- Pro unlocked (30 min) **only** on `Share.sharedAction` (native success signal)
- Dismissed share → no Pro (abuse prevention)
- **Daily quota — 1 per day** via AsyncStorage key `crickapp_share_unlock_date` (YYYY-MM-DD, local date). New API in `ProContext`:
  - `canShareUnlockToday(): Promise<boolean>` — check before opening share sheet
  - `markSharedUnlockToday(): Promise<void>` — call on successful share
- Button label: "Share to unlock 30 min free (1/day)"

### GitHub Actions Build (auto-trigger)
- `.github/workflows/build-android.yml` already triggers on `push: branches: [main]` — APK + AAB build kicks off automatically when user pushes via Save to GitHub or any `git push`.
- Release tag updated to `v1.0.15` with full release notes.

## Expected AdMob Impact
Before (last report):
- UnlockProAd: 66 req / 4 impr (wrong rewarded ID)
- AppOpenAd: 27 req / 11 impr (CLOSED-reload waste)
- RandomInterstitial: 19 req / 1 impr (init preload + CLOSED-reload waste)
- Banner1: 17 req / 3 impr (match rate 29.41%)
- Banner2: 19 req / 14 impr ← KEPT AS-IS ✅

After:
- UnlockProAd: ~real usage (impressions closer to requests; share-unlock offloads some demand)
- AppOpenAd: ~1-2 req/session (one-shot)
- RandomInterstitial: ~1-2 req (lazy)
- Banner1/Banner2: untouched
- Revenue guard: 1/day share quota means users still watch ads for subsequent 30-min sessions

## Prioritised Backlog
- P0: Push to GitHub `main` branch (user via Save to GitHub / git push — patch provided at /app/v1.0.15_ads_share_fix.patch). Workflow auto-triggers.
- P1: Monitor AdMob next 24-48h — verify request/impression ratio improves
- P2: Future — per-user share tracking (referral IDs) for true viral attribution

## Files Modified
- .github/workflows/build-android.yml (release tag → v1.0.15)
- frontend/app.json (remove `@react-native-firebase/app` plugin)
- frontend/app/index.tsx (share button, Share import, daily quota, "1 Ad Watched")
- frontend/app/match/[id].tsx (share button, Share import, daily quota, "1 Ad Watched", prepareInterstitialAd)
- frontend/src/components/AdModal.tsx (3→1 ads UI)
- frontend/src/context/AdMobContext.native.tsx (rewarded ID fix + request-waste optimisations)
- frontend/src/context/AdMobContext.tsx (web stub type parity)
- frontend/src/context/ProContext.tsx (1 ad required + daily share-unlock quota)
- frontend/src/components/NativeAdCard.tsx (restored)
- frontend/src/services/NativeAdRotator.ts (restored)

## Commit
- Branch: main
- SHA: 3fe12ab962030802179ac1df78e6bbff3d64b8d2
- Patch: /app/v1.0.15_ads_share_fix.patch (49 KB)
