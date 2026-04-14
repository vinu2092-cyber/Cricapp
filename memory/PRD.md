# CricApp PRD - Ball-by-Ball Cricket Commentary App

## Original Problem Statement
CricApp v1.0.7 - AdMob optimization, UI enhancements, Unity removal, and version bump.

## Architecture
- **Platform**: React Native (Expo) Android App
- **API**: RapidAPI (Cricbuzz + Cricket Live Data) with Firebase key management
- **Build**: GitHub Actions → APK/AAB → GitHub Release
- **Ads**: Google AdMob only (Unity Ads removed in v1.0.7)

## What's Been Implemented

### v1.0.6-fix1 (Jan 2026)
- `cleanText()` converts literal `\n` to actual newlines
- Content-based stable IDs for commentary deduplication
- CommentaryBuffer class (MAX_BALLS = 100)
- `cleanDisplayText()` in CricketField for newline rendering
- `parseText()` improved with trim/whitespace cleanup

### v1.0.7 (Jan 2026) - Current
**Interstitial Ads:**
- Click threshold increased from 10-15 → 40-60 (random within range)
- Global counter resets after each ad shown

**Banner Ads:**
- Removed Unity Ads mediation completely (plugin, build.gradle deps, proguard rules)
- Replaced MEDIUM_RECTANGLE with ANCHORED_ADAPTIVE_BANNER
- Banner ad inserted every 6 balls in commentary (was at over boundaries)

**UI & Typography:**
- Commentary font size +30%: 14px → 18px, lineHeight 20 → 26
- Text alignment: justify for clean paragraph look
- Event badge text: 10px → 13px
- Section title: 16px → 18px
- Alternating transparent row colors in Commentary (green/reddish/yellow)
- Alternating transparent row colors in Scorecard (batting, bowling, partnerships)
- Header: 'Unlock Features' → 'Unlock' for smaller screens

**Versioning:**
- app.json: version 1.0.7, versionCode 7
- build.gradle: versionCode 7, versionName 1.0.7
- GitHub Release tag: v1.0.7

## Files Modified
1. `frontend/src/context/AdMobContext.native.tsx` - Threshold 40-60, Adaptive Banner
2. `frontend/src/components/CommentarySection.tsx` - Font +30%, banner/6 balls, colors
3. `frontend/src/components/ScorecardSection.tsx` - Alternating row colors
4. `frontend/src/components/Header.tsx` - 'Unlock' button text
5. `frontend/app.json` - v1.0.7, Unity plugin removed
6. `frontend/android/app/build.gradle` - v1.0.7, Unity deps removed
7. `.github/workflows/build-android.yml` - Release tag v1.0.7
8. `frontend/plugins/withUnityAdsMediation.js` - DELETED

## Next Steps
- "Save to GitHub" → Build triggered automatically
- Test APK on device

## Backlog
- P1: Integrate CommentaryBuffer into match detail page for live buffer mgmt
- P2: Hindi translation
- P3: Offline commentary caching
