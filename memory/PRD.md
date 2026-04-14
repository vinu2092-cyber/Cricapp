# CricApp PRD

## Problem Statement
Android native cricket app (React Native + Expo) - build was failing on GitHub Actions due to AndroidManifest.xml manifest merger conflicts after adding @react-native-firebase/app and @react-native-firebase/messaging packages.

## Architecture
- **Frontend**: React Native (Expo managed workflow)
- **Backend**: FastAPI (Python)
- **Build**: GitHub Actions (build-android.yml)
- **Platform**: Android native (Play Store closed testing)

## What's Been Implemented

### April 14, 2026 - Manifest Merger Fix
**Root Cause**: `@react-native-firebase/messaging` library declares its own `default_notification_channel_id` and `default_notification_color` meta-data in its AndroidManifest.xml. These conflicted with the ones added by `expo-notifications` plugin during `expo prebuild`.

**Fix Applied**:
1. Created `/app/frontend/plugins/withManifestFix.js` - Expo config plugin that adds `tools:replace` attributes to conflicting Firebase messaging meta-data entries
2. Added plugin to `app.json` plugins array (last position, runs after all other plugins)

**Files Changed**:
- `frontend/plugins/withManifestFix.js` (NEW)
- `frontend/app.json` (MODIFIED - added plugin reference)
- `frontend/android/app/src/main/AndroidManifest.xml` (MODIFIED - direct fix as backup)

### Previous Agent Changes (Preserved)
1. FCM Notification Fix - @react-native-firebase/app + messaging for native FCM registration
2. In-App button removed - UI cleanup
3. Cricket field size reduced to 154px

## Next Action Items
- "Save to GitHub" → Push changes → GitHub Actions will auto-trigger build
- Verify build passes on GitHub Actions
- If tag v1.0.7-r2 conflicts, manually delete the tag/release on GitHub and re-run

## Backlog
- P0: Verify FCM message delivery after build
- P1: Test notification inbox on real device
- P2: Gradle 9.0 migration (current deprecation warnings)
