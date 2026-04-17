# CricApp — PRD / Work Log

## Project
CricApp (com.cricapp.live) — React Native / Expo Android app, live on Play Store Closed Testing.
Repo: https://github.com/vinu2092-cyber/Cricapp.git
Current version: **v1.0.8** (versionCode 8)

## Core Stack
- Expo / React Native (frontend/)
- FastAPI backend (backend/)
- Cricbuzz RapidAPI providers (3-host failover, Firebase Remote Config keys)
- GitHub Actions workflow `.github/workflows/build-android.yml` for APK + AAB
- Release signing via repo secrets (`RELEASE_KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)

## 2026-04-17 — Phase 1 (Build Fix, earlier)
- compileSdk/targetSdk 35 → 36 in `frontend/app.json` (expo-build-properties) + `frontend/android/gradle.properties`
- Resolved `:app:checkReleaseAarMetadata` failure caused by androidx.activity 1.11.0 / androidx.core 1.17.0 requiring compileSdk 36.

## 2026-04-17 — Phase 2 (Visual Cards, Deep Data Sync, Ads Fix)

### Critical Bug Fixes
1. **Rewarded Ad Unit ID mismatch (reason ads not loading on test device):**
   `src/context/AdMobContext.native.tsx` used `ca-app-pub-9675798593675825/6702704058` but Play Store / app.json has `/6702740458`. Corrected.
2. **Blocking "Ad Not Available" alerts removed** — on-demand rewarded-ad errors now resolve(false) silently so the fall-through in `app/index.tsx` still credits progress.
3. **Watch-ad button UX** — added `adLoading` state + `ActivityIndicator` + `disabled` guard so repeated taps don't stack and the user gets visible feedback while the ad request is in flight.

### Sync-on-Open Hardening (the 10-over gap fix)
- Replaced the `prevCommCountRef === 0` gate with a dedicated `syncDoneRef` flag.
- Added `AppState.addEventListener('change', …)` inside the match screen that re-arms `syncDoneRef = false` and re-runs `loadMatch` when the app returns to the foreground (phone wake / task-switch back).
- Loop now safely bails when Cricbuzz omits `commentaryNextTimestamp` instead of silently doing nothing.
- Still caps at MAX_SYNC_PAGES=60 (~1500 balls) and persists to AsyncStorage keyed by matchId.

### UI — Commentary & Event Cards
- Cards now take 100% width (`eventCard.width: '100%'`, container `marginHorizontal: 0`).
- Gap between event cards bumped `marginVertical: 10 → 12`.
- Standardised fonts:
  - Commentary text: 14px (down from 18)
  - Stats blocks: 13-14px
  - Event card title: 12px, name: 15px, stats: 12-13px, commentary inside: 13px
- OUT card (soft red), NEW BATSMAN card (pastel green), BOWLING CHANGE card (light blue) preserved.

### Team Logos (new)
- Added `teamId` + `imageId` fields to `Team` type and extracted them in both list + detail parsers.
- `MatchCard` now renders a 28px circular team logo next to each team shortName using `https://www.cricbuzz.com/a/img/v1/72x54/i1/c{id}/team.jpg`.
- `app/match/[id].tsx` header shows a 36px team logo above each score block.

### Scorecard avatars
- `MiniAvatar` default size 24 → 32 so photos are actually visible in batter/bowler rows.
- Existing name → faceImageId map (from `/mcenter/v1/{id}` match info) wires them up.

### Pro unlock
- `ADS_REQUIRED` 3 → 2 in `ProContext.tsx` (matches `index.tsx`'s localAdsWatched/2 flow).
- Fall-through behaviour untouched — user always earns progress on each tap.

## How to release
1. User hits **"Save to GitHub"** on the Emergent UI.
2. Workflow `Build Android APK & AAB` runs `assembleRelease` + `bundleRelease` → signed APK & AAB.
3. `CricApp v1.0.8` GitHub Release auto-updated with Phase 2 notes + attached APK/AAB.

## Known constraints / not changed
- Player photos in scorecard / squads depend on Cricbuzz `/mcenter/v1/{id}` returning `faceImageId` for each player. Enrichment logic exists; if the API response omits it for a given match, falls back to silhouette icon.
- versionName and versionCode kept at 1.0.8 / 8 per user request.

## Backlog / Next
- If API still returns no `faceImageId`, consider calling `/mcenter/v1/{id}/team/{teamId}` per team to fetch squads with photos explicitly.
- Optional: lazy-load first-party team crests from a bundled asset map so logos render even for matches where Cricbuzz hasn't populated `imageId`.
