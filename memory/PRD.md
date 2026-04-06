# CricApp - Product Requirements Document

## Original Problem Statement
Clone CricApp from GitHub, fix the Floating Scoreboard (Draw over other apps) feature.

## Architecture
- **Frontend**: React Native with Expo (SDK 54)
- **Backend**: External Cricbuzz API via RapidAPI
- **Native Module**: FloatingWidgetService (Java) for Android overlay

## Key Files
- `/app/frontend/android/app/src/main/java/com/cricapp/live/floatingwidget/FloatingWidgetService.java` - Native Android service
- `/app/frontend/android/app/src/main/java/com/cricapp/live/floatingwidget/FloatingWidgetModule.java` - React Native bridge
- `/app/frontend/src/services/FloatingWidgetService.ts` - TypeScript wrapper
- `/app/frontend/src/components/FloatingScoreboard.tsx` - In-app floating UI
- `/app/frontend/app/match/[id].tsx` - Match detail page

## What's Been Implemented

### April 6, 2026
1. Added AppState listener to detect when user returns from settings
2. Added `pendingOverlayRequest` state to track permission flow
3. Updated "Open Settings" button to use `requestOverlayPermission()` with Linking fallback
4. Added detailed error messages when native module is missing
5. Added debug logging to FloatingWidgetService.ts

## Current Issue - CRITICAL
**Native Module Not Found at Runtime**

The `FloatingWidgetModule` is `null` in `NativeModules` even though:
- Java code exists in `/app/frontend/android/app/src/main/java/com/cricapp/live/floatingwidget/`
- MainApplication.kt registers `FloatingWidgetPackage()`
- AndroidManifest.xml declares the service

**Root Cause**: APK was built without running `npx expo prebuild --clean` first. The native code exists but was never compiled into the APK.

## Fix Required - BUILD PROCESS

### Step 1: Clean Prebuild
```bash
cd frontend
npx expo prebuild --platform android --clean
```

### Step 2: Build APK via GitHub Actions
Trigger the `build-android.yml` workflow which should:
1. Run `expo prebuild`
2. Build APK with Gradle
3. Include the native FloatingWidget module

### Step 3: Test on Device
1. Install new APK
2. Click "Pin Score" button
3. "Open Settings" should now work
4. Enable overlay permission
5. Return to app - floating widget should appear

## Prioritized Backlog

### P0 (Critical)
- [x] Fix "Open Settings" not opening settings
- [ ] **PENDING**: Rebuild APK with `expo prebuild --clean`

### P1 (High)
- [ ] Test floating widget on device after rebuild
- [ ] Verify auto-start after permission grant

### P2 (Medium)
- [ ] Add visual feedback when overlay is active
- [ ] Handle edge cases (low memory, etc.)

## Next Tasks
1. Trigger GitHub Actions build with clean prebuild
2. Test APK on Android device
3. Verify overlay permission flow works
4. Verify floating widget appears over other apps
