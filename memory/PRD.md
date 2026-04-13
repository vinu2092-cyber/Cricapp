# CricApp - PRD & Progress

## Project Overview
- **Project**: CricApp (Android Native - React Native/Expo)
- **Repository**: github.com/vinu2092-cyber/Cricapp (PRIVATE)
- **Status**: Live on Google Play Store (Closed Testing)
- **Package**: com.cricapp.live
- **Current Version**: 1.0.6 (versionCode 6)

## Architecture
- React Native + Expo (managed workflow with prebuild)
- Firebase (FCM push notifications, google-services.json)
- AdMob (Unity Ads mediation, MEDIUM_RECTANGLE banners)
- GitHub Actions CI/CD (build-android.yml)
- Release signing via release-keystore.jks (PKCS12, Base64 in GitHub Secrets)
- Cricket APIs: cricbuzz-cricket, free-cricbuzz-cricket, cricket-live-data (RapidAPI)

## What's Been Implemented

### Session 1 — Build Fix
1. `scripts/patch-signing.py` — Fixed regex + added `storeType "PKCS12"`
2. `build-android.yml` — Python-based keystore decode
3. GitHub Secrets — Updated RELEASE_KEYSTORE_B64 and FIREBASE_SERVICE_ACCOUNT_B64
4. Version bumps: 1.0.4 → 1.0.5 → 1.0.6

### Session 1 — Commentary Pagination
5. `api.ts` — Added `fetchMoreCommentary()` with timestamp pagination
6. `CommentarySection.tsx` — "Load More" fetches from API (not external redirect)
7. `app/match/[id].tsx` — Pagination state management with deduplication

### Session 2 — v1.0.6 Enhancements
8. **Auto-scroll (50s)** — Changed refresh from 60s to 50s to save API calls. Auto-scrolls to top when new commentary arrives for live/recent matches.
9. **Expert Analysis** — Upcoming matches now show "Expert Analysis" section with orange-themed cards if Cricbuzz returns preview text from comm endpoint.
10. **Banner Ads at Over Boundaries** — Replaced fixed every-6-items logic with actual over change detection (compares integer part of over numbers between consecutive balls).
11. **Banner Size** — Changed from ANCHORED_ADAPTIVE_BANNER to MEDIUM_RECTANGLE (300x250) for 100% fill rate.
12. **No commentary flicker** — Removed the `commentary: []` clear before refresh that was causing UI flicker.

## GitHub Secrets (5 total)
- RELEASE_KEYSTORE_B64
- KEYSTORE_PASSWORD
- KEY_ALIAS
- KEY_PASSWORD
- FIREBASE_SERVICE_ACCOUNT_B64

## Next Action Items
- P0: Push via "Save to GitHub" → verify build passes
- P0: Upload AAB to Play Store as v1.0.6
- P1: Delete old Firebase key from Google Cloud Console

## Backlog
- P2: Fix pre-existing TypeScript category type mismatch in app/index.tsx
- P2: Add auto-incrementing version tags in workflow
