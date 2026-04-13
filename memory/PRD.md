# CricApp PRD - Ball-by-Ball Cricket Commentary App

## Original Problem Statement
Apply commentary buffer and `\n` rendering fixes to CricApp React Native (Expo) Android app. 5 specific files need targeted changes for bug fixes.

## Architecture
- **Platform**: React Native (Expo) Android App
- **API**: RapidAPI (Cricbuzz + Cricket Live Data) with Firebase key management
- **Build**: GitHub Actions → APK/AAB → GitHub Release
- **Ads**: Google AdMob (Banner, Interstitial, Rewarded)

## What's Been Implemented (Jan 2026)

### Bug Fixes Applied (v1.0.6-fix1)
1. **`frontend/src/services/api.ts`**
   - `cleanText()` now converts literal `\n` to actual newlines
   - Commentary IDs changed from index-based to content-based for proper deduplication

2. **`frontend/src/services/CommentaryBuffer.ts`** (NEW)
   - Created commentary buffer class with MAX_BALLS = 100

3. **`frontend/src/components/CricketField.tsx`**
   - Added `cleanDisplayText()` helper for `\\n` → newline conversion
   - Applied to both display locations

4. **`frontend/src/components/CommentarySection.tsx`**
   - `parseText()` improved with `.trim()` and whitespace cleanup
   - Count display fixed: `displayedCommentary.length`

5. **`.github/workflows/build-android.yml`**
   - Release tag: `v1.0.6-fix1` (avoids existing tag conflict)
   - Release name: `CricApp v1.0.6 (Bug Fix)`

### Build Fix (iteration 2)
- Issue: "Save to GitHub" only pushed 5 modified files, not full Cricapp codebase
- Fix: Checked out ALL Cricapp files from commit 2091db6, cleaned metro-cache, restored git remote
- Result: Full repo structure now in /app/ including yarn.lock, android/, package.json, etc.

## app.json Version
- version: 1.0.6
- versionCode: 6 (NOT changed)

## Next Steps
- "Save to GitHub" → GitHub Actions will auto-build APK/AAB
- Verify APK on device after build completes

## Backlog
- P1: Integrate CommentaryBuffer class into match detail page
- P2: Hindi translation for commentary
- P3: Offline commentary caching
