# CricApp - PRD (Product Requirements Document)

## Original Problem Statement
Fix Firebase fetching & cleansing, make app Provider-Agnostic, and repair Fallback & Rotation Logic for CricApp Android Native app.

## Architecture
- **Platform**: Android Native (React Native + Expo)
- **Repo**: https://github.com/vinu2092-cyber/Cricapp.git
- **Status**: Live in Google Play Close Testing
- **Build**: GitHub Actions (APK/AAB auto-build on push)

## Core Requirements
1. Firebase Firestore fetches `api_key`, `api_host`, `current_provider` from `app_config/settings`
2. Provider-Agnostic Factory Pattern for 3 providers (cricbuzz-cricket, free-cricbuzz-cricket, cricket-live-data)
3. Fallback chain: Firebase (5s timeout) → User key → Random rotation of 25 hardcoded keys
4. All fetched values trimmed of whitespace
5. No UI/structure changes allowed

## What's Been Implemented (Jan 2026)
### FirebaseKeyService.ts
- Added `current_provider` field fetch from Firestore
- Added `.trim()` cleansing on all fetched values (api_key, api_host, current_provider)
- Added validation (non-empty, min 10 chars for api_key)
- Updated all exports to include `provider` field
- `waitForFirebaseKey()` timeout set to 5 seconds

### api.ts
- **Provider Factory Pattern**: `PROVIDERS` record with configs for 3 providers
  - `cricbuzz-cricket`: HOST_1 endpoints + Cricbuzz parsers
  - `free-cricbuzz-cricket`: HOST_2 endpoints + Cricbuzz parsers (same format)
  - `cricket-live-data`: HOST_3 endpoints + Cricket Live Data parsers
- **Fallback chain** via `fetchData()`:
  - Priority 1: Firebase key (waits up to 5s via `waitForFirebaseKey`)
  - Priority 2: User custom API key
  - Priority 3: Random rotation (Fisher-Yates shuffle) of all 25 hardcoded keys across both Cricbuzz hosts
- **Cricket Live Data parsers**: `extractAllCricketLiveData`, `transformDetailCricketLiveData`, `parseCommentaryCricketLiveData`
- **isCricbuzzLike flag**: Controls Cricbuzz-specific rich data extraction (miniscore, batsmen, oSummary) in `fetchMatchById`
- All existing exports preserved: `fetchLiveMatches`, `fetchRecentMatches`, `fetchUpcomingMatches`, `fetchMatchById`, `openExternalScorecard`, `clearAllCache`, `clearExpiredCache`

### Files Modified (2 only)
- `frontend/src/services/FirebaseKeyService.ts`
- `frontend/src/services/api.ts`

### Files NOT Modified (as required)
- All UI components, layouts, screens, contexts, types, native modules

## Backlog / Next Tasks
- P0: Push to GitHub via "Save to GitHub" → triggers GitHub Actions build
- P1: Test APK on real device with Firebase live data
- P2: Add more Cricket Live Data provider response field mappings once real API responses are observed
- P2: Monitor API key usage during high-traffic events (IPL)
- P3: Add analytics/logging for provider switching events
