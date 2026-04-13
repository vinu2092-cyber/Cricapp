# CricApp - PRD & Progress

## Project Overview
- **Project**: CricApp (Android Native - React Native/Expo)
- **Repository**: github.com/vinu2092-cyber/Cricapp (PRIVATE)
- **Status**: Live on Google Play Store (Closed Testing)
- **Package**: com.cricapp.live
- **Current Version**: 1.0.5 (versionCode 5)

## Architecture
- React Native + Expo (managed workflow with prebuild)
- Firebase (FCM push notifications, google-services.json)
- AdMob (Unity Ads mediation)
- GitHub Actions CI/CD (build-android.yml)
- Release signing via release-keystore.jks (PKCS12, Base64 in GitHub Secrets)
- Cricket APIs: cricbuzz-cricket, free-cricbuzz-cricket, cricket-live-data (RapidAPI)

## What's Been Implemented

### Session 1 — Build Fix (Jan 2026)
1. **`scripts/patch-signing.py`** — Fixed broken regex that only matched inner `debug {}` brace, causing Gradle syntax error at line 140. Replaced with balanced-brace counting algorithm.
2. **`build-android.yml`** — Replaced `echo | base64 -d` with robust Python-based keystore decode to fix "Tag number over 30" corruption error.
3. **`scripts/patch-signing.py`** — Added `storeType "PKCS12"` since keystore is PKCS12 format.
4. **GitHub Secret `RELEASE_KEYSTORE_B64`** — Updated via API with correct base64.
5. **GitHub Secret `FIREBASE_SERVICE_ACCOUNT_B64`** — Rotated after Google disabled exposed key. New key ID: `5e60a08870...`
6. **Version bump** — v1.0.4 → v1.0.5 across app.json, build.gradle, workflow.

### Session 1 — Commentary Pagination Feature
7. **`api.ts`** — Added `fetchMoreCommentary(matchId, timestamp)` for paginated commentary loading via Cricbuzz `?timestamp=` param.
8. **`api.ts`** — Added `queryParams` support to `tryApiCall` and `fetchData`.
9. **`api.ts`** — Added `extractCommTimestamp()` helper to get pagination cursor from API response.
10. **`types/match.ts`** — Added `commentaryNextTimestamp?: number` field.
11. **`CommentarySection.tsx`** — Replaced external cricbuzz redirect with in-app "Load More" that fetches older commentary from API. Works for both live and recent matches.
12. **`app/match/[id].tsx`** — Added pagination state management (`allCommentary`, `nextTimestamp`, `loadingMoreComm`) and `handleLoadMoreCommentary` callback.

## GitHub Secrets (5 total)
- RELEASE_KEYSTORE_B64
- KEYSTORE_PASSWORD (CricApp2026Release)
- KEY_ALIAS (cricapp-release)
- KEY_PASSWORD (CricApp2026Release)
- FIREBASE_SERVICE_ACCOUNT_B64

## Next Action Items
- P0: Push via "Save to GitHub" → verify build passes
- P0: Upload AAB to Play Store as v1.0.5
- P1: Test commentary pagination on live & recent matches
- P1: Delete old Firebase key from Google Cloud Console

## Backlog
- P2: Fix pre-existing TypeScript category type mismatch in app/index.tsx
- P2: Add auto-incrementing version tags in workflow
- P2: Update Node.js 20 actions to remove deprecation warnings
