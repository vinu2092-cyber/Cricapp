# CricApp — PRD / Work Log

## Project
CricApp (com.cricapp.live) — React Native / Expo Android app currently live on Play Store Closed Testing.
Repo: https://github.com/vinu2092-cyber/Cricapp.git
Current version: **v1.0.8** (versionCode 8)

## Core Stack
- Expo / React Native (frontend/)
- FastAPI backend (backend/)
- GitHub Actions workflow `.github/workflows/build-android.yml` for APK + AAB builds
- Release signing via repo secrets (`RELEASE_KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)

## 2026-04-17 — Build Failure Fix (Run #75)
### Problem
GitHub Actions `assembleRelease` task failed in `:app:checkReleaseAarMetadata` with 4 AAR-metadata errors:
- `androidx.activity:activity-ktx:1.11.0` requires compileSdk 36+
- `androidx.activity:activity:1.11.0` requires compileSdk 36+
- `androidx.core:core-ktx:1.17.0` requires compileSdk 36+
- `androidx.core:core:1.17.0` requires compileSdk 36+

App was compiling against `android-35`.

### Fix applied
- `frontend/app.json` → `expo-build-properties` plugin: `compileSdkVersion` & `targetSdkVersion` **35 → 36** (source of truth, survives `npx expo prebuild`).
- `frontend/android/gradle.properties` → `android.compileSdkVersion=36`, `android.targetSdkVersion=36` (kept in sync in case prebuild is skipped).
- `minSdkVersion` kept at 24. App version `1.0.8` and `versionCode 8` left untouched per user request.
- No other files changed (no Kotlin/code modifications; all build warnings are harmless deprecations from expo-modules-core).

### How to release
1. User hits **“Save to GitHub”** on the Emergent UI.
2. Workflow `Build Android APK & AAB` runs `assembleRelease` + `bundleRelease` → signed APK & AAB.
3. `CricApp v1.0.8` GitHub Release auto-created with APK/AAB attached.

## Backlog / Next
- Monitor build #76 (first run with compileSdk 36) to confirm success.
- Consider upgrading deprecated Expo APIs flagged in build warnings (non-blocking).
