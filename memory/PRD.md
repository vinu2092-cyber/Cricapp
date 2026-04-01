# CricApp - Product Requirements Document

## Original Problem Statement
Cricket live score Android app (React Native Expo) imported from GitHub with issues:
1. FloatingScoreboard too small - scores not visible when overlay on other apps
2. App crashes when dragging scoreboard
3. Need 3-minute cache for API key longevity
4. Commentary Load More button for full match
5. Banner ads at over start/end for ALL users
6. Pro user: 3 ads = 30 min no click-based interstitial ads
7. App Opening ads for all users
8. RapidAPI key rotation
9. Match notifications before 10 mins (IPL/International)
10. Overlay button for Pro users
11. Expo APK/AAB build with minimum size
12. **NEW** Draw over other apps (Floating Score Widget) feature for Pro users

## Architecture
- **Frontend**: React Native (Expo SDK 54) - Android-only mobile app
- **Backend**: FastAPI proxy to Cricbuzz via RapidAPI (10 API keys with rotation)
- **Database**: MongoDB (for status checks)
- **Ads**: Google AdMob (react-native-google-mobile-ads)
- **Build**: EAS Build / GitHub Actions (APK + AAB)
- **Native Modules**: FloatingWidgetService (Android overlay)

## User Personas
- Cricket fans wanting live scores on their Android phones
- Users who want floating scoreboard overlay while using other apps
- Free users (see all ads) vs Pro users (no click-based ads for 30 mins)

## Core Requirements
1. Live, Recent, Upcoming match listings with category filters
2. Match detail with cricket field, commentary, scores
3. Floating draggable scoreboard (Pro feature) - BIGGER size now
4. **NEW** Native floating overlay widget (Draw over other apps) - Pro feature
5. Voice commentary (Pro feature)
6. AdMob monetization:
   - App Open: ALL users on app launch
   - Banner: ALL users at over start/end in commentary
   - Interstitial: Non-Pro users every 10-15 clicks
   - Rewarded: Watch 3 to unlock Pro for 30 mins
7. Pro system: Watch 3 rewarded ads → 30 min Pro access (no click ads)
8. SYSTEM_ALERT_WINDOW permission for overlay

## What's Been Implemented

### Session 1 - Previous Work
- [x] Fixed data loading: Rewrote index.tsx extractMatches
- [x] Fixed navigation (uses matchId instead of id)
- [x] Fixed Header component (onUnlockPro made optional)
- [x] Fixed ErrorScreen (added onRetry support)
- [x] Added doodle wallpaper background
- [x] Added Pro unlock modal
- [x] Integrated real AdMob SDK
- [x] Added SYSTEM_ALERT_WINDOW permission

### Session 2 - Previous Work
- [x] **FloatingScoreboard size increased**: 320px width (from 230px), bigger fonts (28px score), team background styling
- [x] **Fixed crash on drag**: Safe PanResponder with error handling, position validation, lastValidPosition fallback
- [x] **3-minute cache**: Backend server.py now caches API responses for 180 seconds to extend API key life
- [x] **Commentary Load More**: Pagination with 20 items per page, "Load More" button at end
- [x] **Banner ads for ALL users**: Ads at over start AND over end in commentary (not just non-Pro)
- [x] **Pro user click-based ads disabled**: After 3 rewarded ads, no interstitial for 30 mins
- [x] **App Opening ads**: Implemented in _layout.tsx for ALL users on app launch
- [x] **Test Device ID enabled**: AdMob configured with testDeviceId for debugging

### Session 3 - Current Work (Jan 2026)
- [x] **Native Floating Widget (Draw Over Other Apps)**: Full implementation
  - Created `FloatingWidgetService.java` - Native Android foreground service with overlay window
  - Created `FloatingWidgetModule.java` - React Native bridge for JS communication
  - Created `FloatingWidgetPackage.java` - React Package registration
  - Updated `MainApplication.kt` to register FloatingWidgetPackage
  - Updated `AndroidManifest.xml` with FOREGROUND_SERVICE permissions and service declaration
  - Created `FloatingWidgetService.ts` - TypeScript wrapper for native module
  - Created `plugins/withFloatingWidget.js` - Expo config plugin for prebuild
  - Updated `app.json` to include the config plugin
  - Updated `match/[id].tsx` with native overlay controls for Pro users

## Native Floating Widget Features
- Shows live score over other apps (YouTube, WhatsApp, etc.)
- Draggable - user can move widget anywhere on screen
- Tap to minimize/expand
- Close button (X) to dismiss
- Auto-updates score in real-time
- Foreground service with notification (keeps running in background)
- Pro users only - requires watching 3 ads to unlock
- Requires SYSTEM_ALERT_WINDOW permission (prompted on first use)

## AdMob Configuration
- App ID: ca-app-pub-9675798593675825~2399929714
- App Open: ca-app-pub-9675798593675825/4826782503
- Interstitial: ca-app-pub-9675798593675825/8438724452
- Banner: ca-app-pub-9675798593675825/8616886104
- Rewarded: ca-app-pub-9675798593675825/6702740458
- Test Device: 553c7721-4821-461b-9f62-8584b1e60745

## API Keys (RapidAPI - Cricbuzz)
- 10 API keys with automatic rotation on 429/403 errors
- 2 providers for fallback (cricbuzz-cricket2, cricbuzz-cricket)
- 3-minute server-side cache for API longevity

## File Structure - Native Module
```
frontend/android/app/src/main/java/com/mycricapp/live/
├── MainActivity.kt
├── MainApplication.kt (modified - adds FloatingWidgetPackage)
└── floatingwidget/
    ├── FloatingWidgetService.java (Native overlay service)
    ├── FloatingWidgetModule.java (React Native bridge)
    └── FloatingWidgetPackage.java (Package registration)

frontend/src/services/
└── FloatingWidgetService.ts (TypeScript wrapper)

frontend/plugins/
└── withFloatingWidget.js (Expo config plugin)
```

## Prioritized Backlog
### P0 (Critical) - COMPLETED
- [x] FloatingScoreboard size fix
- [x] Drag crash fix
- [x] Banner ads for all users
- [x] Pro user ad-free experience
- [x] **Native floating widget (Draw over other apps)**

### P1 (Important) - PENDING
- [ ] Match notifications 10 min before IPL/International matches
- [ ] Build APK/AAB with EAS (requires correct Expo token)

### P2 (Nice to have)
- [ ] Widget for home screen
- [ ] Multi-language support beyond English/Hindi

## Build Instructions
1. Push code to GitHub (use "Save to Github" feature)
2. GitHub Actions will automatically:
   - Run `npx expo prebuild --platform android --clean`
   - Build APK using `./gradlew assembleRelease`
   - Build AAB using `./gradlew bundleRelease`
3. Download artifacts from GitHub Actions

## Build Size Optimizations Applied
- ✅ R8 full mode enabled (maximum code shrinking)
- ✅ Resource shrinking enabled (removes unused resources)
- ✅ ProGuard enabled (code obfuscation & shrinking)
- ✅ Only ARM architectures (removed x86/x86_64 - saves ~15MB)
- ✅ PNG crunching enabled (image compression)
- ✅ Assets compressed (8.5MB → 1.4MB = 83% reduction)
- ✅ Debug logs removed in release
- ✅ Network inspector disabled in release
- ✅ Animated WebP disabled (saves ~3.4MB)
- ✅ GIF support disabled (not needed)

**Expected APK Size: ~20-25MB**
**Expected AAB Size: ~15-18MB**

## Next Tasks
1. Push code to GitHub using "Save to Github" feature
2. GitHub Actions will trigger build automatically
3. Download APK/AAB from GitHub Actions artifacts
4. Test on real Android device
5. Grant overlay permission on device
6. Test native floating widget over other apps
