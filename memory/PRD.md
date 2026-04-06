# CricApp - Product Requirements Document

## Original Problem Statement
Clone CricApp from GitHub, fix the Floating Scoreboard (Draw over other apps) feature.

## Root Cause Found (April 6, 2026)
`expo prebuild --clean` DELETES the entire `android/` folder and regenerates it.
The custom Java files were being deleted. The old plugin only modified AndroidManifest.xml - it didn't recreate the Java files.

## THE FIX
Updated `/frontend/plugins/withFloatingWidget.js` to:
1. **Create Java files programmatically** after prebuild runs
2. Modify MainApplication.kt to register FloatingWidgetPackage
3. Update AndroidManifest.xml with service and permissions

## Key Files
- `/frontend/plugins/withFloatingWidget.js` - **THE MAIN FIX** - Config plugin that injects all native code
- `/frontend/src/services/FloatingWidgetService.ts` - TypeScript wrapper

## Java Files Injected by Plugin
The plugin automatically creates these files in `android/app/src/main/java/com/cricapp/live/floatingwidget/`:
- FloatingWidgetService.java (528 lines) - Foreground service with WindowManager overlay
- FloatingWidgetModule.java - React Native bridge module
- FloatingWidgetPackage.java - React package registration

## Build Instructions
1. Push code to GitHub using "Save to GitHub" button
2. GitHub Actions will run `npx expo prebuild --platform android --clean`
3. The plugin will inject all native Java files
4. APK and AAB will be generated

## What's Been Implemented
- [x] Complete config plugin that creates Java files during prebuild
- [x] Plugin modifies MainApplication.kt automatically
- [x] Plugin adds all required permissions to AndroidManifest.xml
- [x] Cleaned up frontend code - removed error popups

## Next Steps
1. Push to GitHub
2. Wait for GitHub Actions build (~15-20 min)
3. Download APK/AAB from Actions artifacts
4. Test on Android device
