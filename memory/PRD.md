# CricApp - Product Requirements Document

## Original Problem Statement
Android Native Cricket App (com.cricapp.live) - Firebase Dynamic API Key integration, hardcoded API key rotation expansion, and version upgrade for Play Store update.

## Architecture
- **Platform**: React Native + Expo (Android)
- **API**: RapidAPI Cricbuzz Cricket APIs (2 providers)
- **Firebase**: JS SDK for Firestore config fetch
- **State**: AsyncStorage for caching

## What's Been Implemented (April 12, 2026)

### Task 1: Firebase Integration (Dynamic API Key)
- Created `src/services/FirebaseKeyService.ts` - Firebase JS SDK initialization
- Fetches `api_key` and `api_host` from Firestore path: `app_config/settings`
- Background non-blocking fetch on app startup (5s timeout)
- Cached results for instant subsequent access
- `google-services.json` placed in `android/app/`

### Task 2: Hardcoded API Rotation (6 New Keys Added)
- Added 6 new keys with Provider 2 host: `free-cricbuzz-cricket-api.p.rapidapi.com`
- Total keys: 19 (Provider 1) + 6 (Provider 2) = 25
- Updated both `api.ts` and `NotificationContext.tsx`
- New keys: 49895f57cb..., 60879faad9..., 015297ae4c..., 3b5c50ff5f..., 948dd6c539..., efa0ba9303...

### Firebase Priority & Fallback Logic
- **Priority 1**: Firebase Firestore key (dynamic)
- **Priority 2**: User's custom API key
- **Priority 3**: Provider 1 (19 keys - cricbuzz-cricket.p.rapidapi.com)
- **Priority 4**: Provider 2 (6 keys - free-cricbuzz-cricket-api.p.rapidapi.com)

### Task 3: Version Upgrade
- `app.json`: versionCode 3→4, version "1.0.3"→"1.0.4"
- `build.gradle`: versionCode 4, versionName "1.0.4"

### GitHub Actions Workflow
- `.github/workflows/build-android.yml` - Auto builds APK + AAB on push
- Creates GitHub Release with download artifacts

## Files Changed
1. `frontend/src/services/FirebaseKeyService.ts` (NEW)
2. `frontend/src/services/api.ts` (MODIFIED - Firebase + 6 new keys)
3. `frontend/src/context/NotificationContext.tsx` (MODIFIED - Firebase + 6 new keys)
4. `frontend/app.json` (MODIFIED - version 4)
5. `frontend/android/app/build.gradle` (MODIFIED - version 4)
6. `frontend/android/app/google-services.json` (NEW)
7. `frontend/package.json` (MODIFIED - firebase dependency)
8. `.github/workflows/build-android.yml` (MODIFIED - build workflow)

## Existing UI - NOT CHANGED
- No changes to any UI components
- Header, MatchCard, TabBar, etc. all untouched

## P0 Done
- [x] Firebase dynamic key fetch
- [x] 6 new API keys added
- [x] Firebase-first priority logic
- [x] Hardcoded fallback (no crash)
- [x] Version upgrade 3→4

## P1 (User mentioned - not in scope)
- [ ] Notification button in header not working (user reported separately)

## Next Actions
- Push to GitHub via "Save to GitHub"
- GitHub Actions will auto-build APK + AAB
- Download from GitHub Releases page
