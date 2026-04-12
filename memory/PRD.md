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
2. Provider-Agnostic Factory Pattern for 3 providers
3. Fallback chain: Firebase (5s timeout) -> User key -> Random rotation of 25 hardcoded keys
4. All fetched values trimmed of whitespace
5. No UI/structure changes allowed

## Key Findings (Debugging Session 2)
- **File Location Bug**: Changes were made in `/app/Cricapp/` but "Save to GitHub" pushes from `/app/`. Files now correctly placed in BOTH locations.
- **API Key Status**: 14 out of 19 P1 keys are NOT_SUBSCRIBED or QUOTA_EXCEEDED. Only 5 keys work on HOST_1.
- **HOST_2 Endpoints**: `free-cricbuzz-cricket-api.p.rapidapi.com` does NOT support standard Cricbuzz endpoints (`/matches/v1/live`, `/mcenter/v1/{id}`). All HOST_2 API calls fail with "Endpoint does not exist".
- **Root Cause of Match Detail Failure**: Old sequential rotation hit dead keys first. By the time match detail was called, all tried keys were NOT_SUBSCRIBED.

## What's Been Implemented (Jan 2026)

### FirebaseKeyService.ts
- Added `current_provider` field fetch from Firestore
- `.trim()` cleansing on all fetched values
- Validation (non-empty, min 10 chars for api_key)
- `waitForFirebaseKey()` with 5-second timeout
- All exports include `provider` field

### api.ts
- **Provider Factory Pattern**: 3 providers (cricbuzz-cricket, free-cricbuzz-cricket, cricket-live-data)
- **Smart Firebase Fallback**: If Firebase key fails on configured host (e.g. HOST_2), automatically retries on HOST_1
- **Random Rotation**: Fisher-Yates shuffle of all 25 keys, tries up to 15 keys on HOST_1
- **HOST_1 Priority**: Fallback rotation uses only HOST_1 (cricbuzz-cricket.p.rapidapi.com) since HOST_2 endpoints don't exist
- **Cricket Live Data Parsers**: Full parsing support ready for when provider is switched
- **All existing exports preserved**

### Files Modified (2 files, BOTH locations)
- `/app/frontend/src/services/api.ts` (pushed to GitHub)
- `/app/frontend/src/services/FirebaseKeyService.ts` (pushed to GitHub)
- `/app/Cricapp/frontend/src/services/api.ts` (synced copy)
- `/app/Cricapp/frontend/src/services/FirebaseKeyService.ts` (synced copy)

## Backlog / Next Tasks
- P0: Push to GitHub via "Save to GitHub" -> triggers GitHub Actions build
- P0: Test APK on real device - verify match detail + commentary loads
- P1: Replace exhausted API keys (14 dead keys) with fresh subscriptions
- P2: Find correct HOST_2 endpoints for free-cricbuzz-cricket-api
- P2: Add Scorecard/Partnerships page (user requested)
- P3: Provider health monitoring
