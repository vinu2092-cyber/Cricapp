# CricApp PRD

## Problem Statement
Android native cricket app (React Native + Expo) - build was failing on GitHub Actions due to:
1. AndroidManifest.xml manifest merger conflicts (fixed with config plugin)
2. Missing `frontend/yarn.lock` in git (file wasn't tracked, so Save to GitHub didn't push it)

## Architecture
- **Frontend**: React Native (Expo managed workflow)
- **Backend**: FastAPI (Python)
- **Build**: GitHub Actions (build-android.yml)
- **Platform**: Android native (Play Store closed testing)

## What's Been Implemented

### April 14, 2026 - Build Fix (Two Issues)

**Issue 1 - Manifest Merger Fix**:
- Root Cause: `@react-native-firebase/messaging` library conflicts with `expo-notifications` plugin meta-data
- Fix: Created `frontend/plugins/withManifestFix.js` Expo config plugin
- Added plugin to `app.json` plugins array (last position)

**Issue 2 - Missing yarn.lock**:
- Root Cause: `frontend/yarn.lock` was untracked in Emergent's git, so "Save to GitHub" didn't push it
- GitHub Actions `setup-node` failed: "No existing directories found containing cache-dependency-path=frontend/yarn.lock"
- Fix: `git add frontend/yarn.lock frontend/android/gradle/wrapper/gradle-wrapper.jar`

**Files Changed**:
- `frontend/plugins/withManifestFix.js` (NEW)
- `frontend/app.json` (MODIFIED - added plugin reference)
- `frontend/android/app/src/main/AndroidManifest.xml` (MODIFIED - direct fix as backup)
- `frontend/yarn.lock` (STAGED - was untracked)
- `frontend/android/gradle/wrapper/gradle-wrapper.jar` (STAGED - was untracked)

### Previous Agent Changes (Preserved)
1. FCM Notification Fix - @react-native-firebase/app + messaging
2. In-App button removed
3. Cricket field size reduced to 154px

## Next Action Items
- "Save to GitHub" → Push → Build should pass
- If tag v1.0.7-r2 conflicts, delete it on GitHub and re-run workflow

## Backlog
- P0: Verify FCM message delivery after successful build
- P1: Test notification inbox on real device
- P2: Gradle 9.0 migration (deprecation warnings)
- P2: Clean up root .gitignore (has many duplicate entries)
