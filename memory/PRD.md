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
   - Commentary IDs changed from index-based (`matchId-i`) to content-based (`matchId-over-textHash`) for proper deduplication across API refreshes

2. **`frontend/src/services/CommentaryBuffer.ts`** (NEW)
   - Created commentary buffer class with MAX_BALLS = 100
   - Dedup by content-based ID using Map

3. **`frontend/src/components/CricketField.tsx`**
   - Added `cleanDisplayText()` helper to convert `\\n` to actual newlines
   - Applied to both display locations of `lastCommentary.english`

4. **`frontend/src/components/CommentarySection.tsx`**
   - `parseText()` now includes `.trim()` and whitespace cleanup
   - Count display fixed: uses `displayedCommentary.length` instead of `commentary.length`

5. **`.github/workflows/build-android.yml`**
   - Release tag: `v1.0.6` → `v1.0.6-fix1` (avoids tag conflict)
   - Release name: `CricApp v1.0.6 (Bug Fix)`

## Next Steps
- "Save to GitHub" → GitHub Actions will auto-build APK/AAB
- Verify APK on device after build completes
- Monitor commentary dedup behavior in production

## Backlog
- P1: Integrate CommentaryBuffer class into match detail page for live buffer management
- P2: Add Hindi translation for commentary
- P3: Offline commentary caching
