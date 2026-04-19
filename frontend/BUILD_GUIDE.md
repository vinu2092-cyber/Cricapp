# CricApp - Build & Deployment Guide

## Prerequisites
1. Node.js 18+ installed
2. Expo CLI: `npm install -g expo-cli`
3. EAS CLI: `npm install -g eas-cli`
4. Expo account logged in: `eas login`

## Quick Build Commands

### Step 1: Install Dependencies
```bash
cd frontend
yarn install
```

### Step 2: Build APK (for testing/direct install)
```bash
eas build --platform android --profile preview --non-interactive
```
This creates a **release APK** (~30MB) that can be installed directly on Android devices.

### Step 3: Build AAB (for Play Store)
```bash
eas build --platform android --profile production --non-interactive
```
This creates an **Android App Bundle** optimized for Play Store submission.

### Step 4: Build Both Simultaneously
```bash
eas build --platform android --profile preview --non-interactive &
eas build --platform android --profile production --non-interactive &
wait
```

## EAS Build Profiles

| Profile | Format | Use Case |
|---------|--------|----------|
| `development` | Debug APK | Local development with dev client |
| `preview` | Release APK | Testing on real devices |
| `production` | AAB | Google Play Store submission |

## Important Notes

- **AdMob IDs**: Production IDs are configured in `app.json`
- **RapidAPI Keys**: 10 keys with dual-host rotation in `backend/server.py`
- **Build Size Target**: ~30MB APK
- **Min SDK**: 24 (Android 7.0)
- **Target SDK**: 35 (Android 15)

## Backend Deployment
The FastAPI backend needs to be deployed separately (e.g., Railway, Render, or AWS).
Update `BACKEND_URL` in `frontend/src/services/api.ts` after deployment.

## Post-Build Checklist
- [ ] Install APK on test device
- [ ] Verify splash screen displays fullscreen
- [ ] Check AdMob ads load (App Open, Banner, Interstitial, Rewarded)
- [ ] Test Pro unlock via 3 rewarded ads
- [ ] Test floating scoreboard drag without crash
- [ ] Test notification overlay in notification bar
- [ ] Test voice commentary (Pro feature)
- [ ] Verify Match Mood Meter effects (play a live match)
- [ ] Test "View Full Match Details" opens browser
- [ ] Verify API data loads (live, recent, upcoming matches)
