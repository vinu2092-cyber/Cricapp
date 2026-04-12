# CricApp - PRD (Product Requirements Document)

## Original Problem Statement
Fix Firebase fetching & cleansing, make app Provider-Agnostic, repair Fallback & Rotation Logic, build Scorecard feature.

## Architecture
- **Platform**: Android Native (React Native + Expo)
- **Repo**: https://github.com/vinu2092-cyber/Cricapp.git
- **Build**: GitHub Actions (APK/AAB auto-build on push)

## What's Been Implemented

### Session 1: Firebase + Fallback Fix
- Firebase fetches `api_key`, `api_host`, `current_provider` from Firestore
- Provider Factory Pattern for 3 providers
- Fallback: Firebase (5s) -> User key -> Random rotation on HOST_1
- Firebase key double-try (HOST_2 -> HOST_1 fallback)

### Session 2: Key Cleanup + Scorecard Feature
**API Key Cleanup:**
- Removed 11 NOT_SUBSCRIBED keys from MATCH_KEYS_P1 (19 -> 9 keys)
- Removed 1 NOT_SUBSCRIBED key from MATCH_KEYS_P2 (6 -> 5 keys)
- Removed 1 NOT_SUBSCRIBED key from COMM_KEYS (5 -> 4 keys)
- Kept all QUOTA_EXCEEDED keys (they reset daily)
- Total active keys: 14 (was 25)

**Scorecard Feature (NEW):**
- Added `/mcenter/v1/{id}/scard` endpoint to all provider configs
- New `fetchScorecard(matchId)` API function with cache support
- New `ScorecardSection.tsx` component with:
  - Innings toggle tabs (switch between innings)
  - Batting table (Batter, R, B, 4s, 6s, SR) with dismissal info
  - Extras row
  - Total row (green bar with score, overs, run rate)
  - Bowling table (Bowler, O, M, R, W, ECO)
  - Fall of Wickets section (visual chips)
  - Partnerships section (pair names, individual + total runs)
- Added Commentary/Scorecard tab bar in match detail page
- Design matches Cricbuzz style (green theme, white cards)
- Uses same Firebase + fallback logic as all other API calls

### Files Modified
- `frontend/src/services/api.ts` - Key cleanup + scorecard endpoint
- `frontend/src/services/FirebaseKeyService.ts` - Provider support
- `frontend/app/match/[id].tsx` - Tab bar + ScorecardSection integration
- `frontend/src/components/ScorecardSection.tsx` - NEW component

## Backlog
- P0: Push to GitHub -> build APK
- P1: Monitor key quota; consider adding more subscribed keys
- P2: Add "Yet to Bat" section in scorecard
- P3: Provider health monitoring dashboard
