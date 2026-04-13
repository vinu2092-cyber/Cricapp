# CricApp - Product Requirements Document

## Original Problem Statement
React Native Android Cricket App (CricApp) on Play Store (closed testing). Fix bugs in v1.0.6 related to commentary rolling buffer and text rendering.

## Architecture
- **Platform**: React Native (Expo) Android App
- **API**: Cricbuzz RapidAPI (multiple providers with fallback rotation)
- **Storage**: AsyncStorage for commentary buffer, Firebase for dynamic API keys
- **Build**: GitHub Actions (AAB/APK on push to main)

## Core Requirements (Static)
1. Commentary Rolling Buffer: Save up to 100 balls for International/League matches in AsyncStorage
2. FIFO logic: When 101st ball arrives, oldest gets deleted
3. Text rendering: No raw `\n` sequences displayed
4. Only International/League matches use buffer (not Domestic)
5. Don't break existing UI/features/ads

## What's Been Implemented (v1.0.7 - Jan 2026)
1. **Fixed Commentary ID Generation**: Changed from index-based IDs (`matchId-0`) to content-based stable IDs (`matchId-over-textHash`). This was the ROOT CAUSE of buffer not accumulating - index-based IDs caused dedup failures across API refreshes.
2. **MAX_BALLS = 100**: Changed from 50 to 100 in CommentaryBuffer.ts
3. **`\n` Rendering Fix**: Added text cleanup in:
   - `api.ts` cleanText function (source-level cleanup)
   - `CricketField.tsx` cleanDisplayText function (display-level cleanup)
   - `CommentarySection.tsx` parseText function (improved)
4. **Commentary Count**: Shows actual buffered items count (displayedCommentary.length)
5. **Version Bump**: v1.0.6 -> v1.0.7 (app.json + build-android.yml)

## Files Modified
- `frontend/src/services/api.ts` - Content-based IDs, cleanText \n fix
- `frontend/src/services/CommentaryBuffer.ts` - MAX_BALLS 50 -> 100
- `frontend/src/components/CricketField.tsx` - cleanDisplayText for \n
- `frontend/src/components/CommentarySection.tsx` - parseText fix, count display
- `frontend/app.json` - Version 1.0.7, versionCode 7
- `.github/workflows/build-android.yml` - v1.0.7 tag

## Backlog
- P0: None (all critical bugs fixed)
- P1: Test on actual device with live match to verify buffer accumulation over time
- P2: Consider FlatList for commentary rendering performance with 100+ items
- P2: Add visual indicator when buffer is loading from AsyncStorage
