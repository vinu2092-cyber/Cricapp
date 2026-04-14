# CricApp - Production Release Guide
# टेस्टिंग के बाद Play Store Release के लिए Complete Guide

---

## 📋 INDEX (विषय सूची)

1. [AdMob Test IDs को Production IDs में बदलना](#1-admob-test-ids-को-production-ids-में-बदलना)
2. [App Version बढ़ाना](#2-app-version-बढ़ाना)
3. [Package Name Change (अगर जरूरी हो)](#3-package-name-change)
4. [App Name Change](#4-app-name-change)
5. [Splash Screen और Icon](#5-splash-screen-और-icon)
6. [Build Commands](#6-build-commands)
7. [Checklist Before Release](#7-checklist-before-release)

---

## 1. AdMob Test IDs को Production IDs में बदलना

### File Path:
```
frontend/src/context/AdMobContext.native.tsx
```

### Line Numbers: 15-22

### Current Code (Test IDs):
```typescript
// Google Official Test Ad IDs (for testing/development)
const AD_IDS = {
  appOpen: 'ca-app-pub-3940256099942544/9257395921',      // CORRECT App Open Test ID
  interstitial: 'ca-app-pub-3940256099942544/1033173712', // Interstitial Test ID
  banner: 'ca-app-pub-3940256099942544/6300978111',       // Banner Test ID
  rewarded: 'ca-app-pub-3940256099942544/5224354917',     // Rewarded Test ID
  native: 'ca-app-pub-3940256099942544/2247696110',       // Native Test ID
};
```

### Production Code में बदलें (अपनी IDs डालें):
```typescript
// Production Ad IDs - AdMob Console से लें
const AD_IDS = {
  appOpen: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',      // अपनी App Open Ad ID
  interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX', // अपनी Interstitial Ad ID
  banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',       // अपनी Banner Ad ID
  rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',     // अपनी Rewarded Ad ID
  native: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',       // अपनी Native Ad ID (अगर use करें)
};
```

### AdMob App ID भी बदलना है:

#### File Path:
```
frontend/app.json
```

#### Line Numbers: 29-31 और 72-74

#### Current Code (Test App ID):
```json
"android": {
  "app_id": "ca-app-pub-3940256099942544~3347511713"
}
```

#### Production में बदलें:
```json
"android": {
  "app_id": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"  // AdMob Console से अपना App ID
}
```

#### Second Location (Line 72-74):
```json
"react-native-google-mobile-ads": {
  "android_app_id": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
}
```

---

## 2. App Version बढ़ाना

### File Path:
```
frontend/app.json
```

### Line Numbers: 4-5

### Current Code:
```json
{
  "expo": {
    "name": "CricApp",
    "slug": "cricapp",
    "version": "1.0.0",           // ← Line 5: User-facing version
```

### Version बढ़ाने का तरीका:
- **1.0.0** → **1.0.1** (छोटा bug fix)
- **1.0.0** → **1.1.0** (नया feature)
- **1.0.0** → **2.0.0** (major update)

### Android Version Code (Line 27-28):
```json
"android": {
  "versionCode": 1,              // ← हर release पर +1 करें (1, 2, 3, 4...)
  "package": "com.cricapp.live",
```

**Important:** `versionCode` हमेशा पिछले से ज्यादा होना चाहिए, वरना Play Store reject करेगा।

---

## 3. Package Name Change

### File Path:
```
frontend/app.json
```

### Line Number: 28

### Current Code:
```json
"android": {
  "package": "com.cricapp.live",   // ← Package Name
```

### अगर बदलना है:
```json
"android": {
  "package": "com.yourcompany.yourapp",
```

**⚠️ Warning:** Package name बदलने के बाद:
1. `npx expo prebuild --clean` run करना होगा
2. Play Store पर नई app बनानी होगी (existing app update नहीं होगी)

---

## 4. App Name Change

### File Path:
```
frontend/app.json
```

### Line Number: 3

### Current Code:
```json
{
  "expo": {
    "name": "CricApp",            // ← App का display name
```

---

## 5. Splash Screen और Icon

### App Icon Path:
```
frontend/assets/icon.png
```
- Size: 1024x1024 pixels recommended
- Format: PNG

### Adaptive Icon (Android):
```
frontend/assets/adaptive-icon.png
```

### Splash Screen:
```
frontend/assets/splash-icon.png
```

### Configuration in app.json (Lines 7-16):
```json
"icon": "./assets/icon.png",
"splash": {
  "image": "./assets/splash-icon.png",
  "resizeMode": "contain",
  "backgroundColor": "#0D1B0E"
},
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "backgroundColor": "#0D1B0E"
  }
}
```

---

## 6. Build Commands

### GitHub Actions से Build (Recommended):
1. GitHub पर जाओ
2. "Save to GitHub" से push करो
3. Actions tab में जाओ
4. Build automatically trigger होगी
5. Artifacts से APK/AAB download करो

### Local Build (Optional):
```bash
cd frontend
npx expo prebuild --platform android --clean
cd android
./gradlew bundleRelease   # AAB के लिए (Play Store)
./gradlew assembleRelease # APK के लिए (Testing)
```

### Output Files:
- **AAB (Play Store):** `android/app/build/outputs/bundle/release/app-release.aab`
- **APK (Testing):** `android/app/build/outputs/apk/release/app-release.apk`

---

## 7. Checklist Before Release

### ✅ AdMob Changes:
- [ ] `AdMobContext.native.tsx` में Test IDs → Production IDs
- [ ] `app.json` में Test App ID → Production App ID (2 जगह)

### ✅ Version Updates:
- [ ] `version` बढ़ाया (जैसे 1.0.0 → 1.0.1)
- [ ] `versionCode` बढ़ाया (जैसे 1 → 2)

### ✅ Assets Check:
- [ ] App icon सही है
- [ ] Splash screen सही है

### ✅ Testing:
- [ ] App crash नहीं हो रही
- [ ] Ads show हो रही हैं
- [ ] सभी features काम कर रहे हैं

### ✅ Build:
- [ ] GitHub Actions से build trigger किया
- [ ] AAB file download किया
- [ ] Play Console पर upload किया

---

## 📁 Important Files Summary

| क्या बदलना है | File Path | Line Number |
|--------------|-----------|-------------|
| Ad Unit IDs | `frontend/src/context/AdMobContext.native.tsx` | 15-22 |
| AdMob App ID #1 | `frontend/app.json` | 30 |
| AdMob App ID #2 | `frontend/app.json` | 73 |
| App Version | `frontend/app.json` | 5 |
| Version Code | `frontend/app.json` | 27 |
| Package Name | `frontend/app.json` | 28 |
| App Name | `frontend/app.json` | 3 |
| App Icon | `frontend/assets/icon.png` | - |
| Splash Screen | `frontend/assets/splash-icon.png` | - |

---

## 🔑 AdMob Console से IDs कैसे लें

1. https://admob.google.com/ पर जाओ
2. अपनी App select करो
3. "Ad units" पर click करो
4. हर ad type के लिए:
   - "Add ad unit" click करो
   - Ad unit बनाओ
   - ID copy करो (format: `ca-app-pub-XXXX/YYYY`)

### Ad Types जो बनाने हैं:
1. **App Open** - App खुलने पर
2. **Interstitial** - Full screen ad (clicks पर)
3. **Banner** - Bottom पर छोटी ad
4. **Rewarded** - Video देखो, Pro unlock करो

---

## 🚀 Final Release Steps

### Step 1: Code Changes (GitHub पर)
1. GitHub repo खोलो
2. `frontend/src/context/AdMobContext.native.tsx` edit करो
3. Test IDs हटाओ, Production IDs डालो
4. `frontend/app.json` edit करो
5. App ID और version update करो
6. Commit करो

### Step 2: Build
1. GitHub Actions automatically build करेगी
2. या manually trigger करो
3. ~15-20 minutes wait करो
4. AAB download करो

### Step 3: Play Console Upload
1. https://play.google.com/console
2. अपनी app select करो
3. "Production" → "Create new release"
4. AAB upload करो
5. Release notes लिखो
6. Review के लिए submit करो

---

**Document Created:** April 2026
**For App:** CricApp - Live Cricket Scores
**Author:** Emergent AI Agent

---

## ❓ Common Issues

### Q: Build fail हो रही है?
A: `npx expo prebuild --clean` run करो पहले

### Q: Ads नहीं दिख रही production में?
A: AdMob account में app linked है check करो, और ad units approved हैं

### Q: Play Store reject कर रहा है?
A: versionCode पुराने से ज्यादा है check करो

### Q: Package name change करने के बाद issue?
A: Clean build करो: `rm -rf android && npx expo prebuild --clean`
