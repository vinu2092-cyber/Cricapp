# CricApp - Complete Technical Documentation

## 📱 App Identity

| Property | Value |
|----------|-------|
| **App Name** | CricApp |
| **Package Name** | `com.cricapp.live` |
| **Version** | 1.0.1 |
| **Version Code** | Auto-generated |
| **Developer** | GemmiApps |
| **Min SDK** | 24 (Android 7.0) |
| **Target SDK** | 35 (Android 15) |
| **Compile SDK** | 35 |

---

## 🔑 API KEYS STATUS

### 1. AdMob (Google Mobile Ads) - ✅ WORKING

| Ad Type | Ad Unit ID | Status |
|---------|-----------|--------|
| **App ID** | `ca-app-pub-9675798593675825~2399929714` | ✅ Active |
| **App Open Ad** | `ca-app-pub-9675798593675825/4826782503` | ✅ Working |
| **Interstitial Ad** | `ca-app-pub-9675798593675825/8438724452` | ✅ Working |
| **Banner Ad** | `ca-app-pub-9675798593675825/8616886104` | ✅ Working |
| **Rewarded Ad** | `ca-app-pub-9675798593675825/6702740458` | ✅ Working |
| **Test Device ID** | `553c7721-4821-461b-9f62-8584b1e60745` | For testing |

**AdMob Console:** https://admob.google.com/

### 2. RapidAPI (Cricbuzz Data) - ⚠️ CHECK LIMITS

| Key # | API Key | Status |
|-------|---------|--------|
| 1 | `90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc` | Check limit |
| 2 | `d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4` | Check limit |
| 3 | `7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237` | Check limit |
| 4 | `59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa` | Check limit |
| 5 | `c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61` | Check limit |
| 6 | `2a21f65881msh680271f280de7p182fbdjsn151d068c6392` | Check limit |
| 7 | `cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03` | Check limit |
| 8 | `4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32` | Check limit |
| 9 | `ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482` | Check limit |
| 10 | `db67e8004emsh40add8626f58e58p183678jsne28298b94c3b` | Check limit |

**RapidAPI Dashboard:** https://rapidapi.com/developer/dashboard
**API Providers:**
- Primary: `cricbuzz-cricket.p.rapidapi.com`
- Fallback: `cricbuzz.p.rapidapi.com`

**Key Rotation Logic:** Auto-rotates on 429 (rate limit) or 403 (forbidden) errors
**Cache:** 3 minutes server-side cache to extend API life

---

## 🏪 PLAY STORE UPLOAD REQUIREMENTS

### Required Before Upload:

| Item | Status | Notes |
|------|--------|-------|
| **Package Name** | ✅ `com.cricapp.live` | NEVER change after upload |
| **Version Code** | Auto | Must increment each update |
| **Version Name** | 1.0.1 | User-visible version |
| **Signed AAB** | Build from GitHub Actions | Use release keystore |
| **Privacy Policy URL** | ❌ NEEDED | Host on your website |
| **App Icon** | ✅ 1024x1024 | `assets/icon.png` |
| **Feature Graphic** | ❌ NEEDED | 1024x500 PNG |
| **Screenshots** | ❌ NEEDED | Min 2, phone + tablet |
| **Short Description** | ❌ NEEDED | Max 80 chars |
| **Full Description** | ❌ NEEDED | Max 4000 chars |

### Play Console Settings:

```
App Category: Sports
Content Rating: Everyone
Target Age: 13+
Ads Declaration: Yes (contains ads)
Data Safety: 
  - Collects: Device ID (for ads)
  - Shares: Analytics data with Google
```

### Signing Key (CRITICAL):

**Current Status:** Using debug.keystore (NOT for production!)

**For Production Upload, you need:**
1. Generate release keystore:
```bash
keytool -genkey -v -keystore cricapp-release.keystore -alias cricapp -keyalg RSA -keysize 2048 -validity 10000
```

2. Store these SECURELY (NEVER lose them!):
   - `cricapp-release.keystore` file
   - Keystore password
   - Key alias: `cricapp`
   - Key password

3. Add to `android/gradle.properties`:
```properties
MYAPP_UPLOAD_STORE_FILE=cricapp-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=cricapp
MYAPP_UPLOAD_STORE_PASSWORD=your_password
MYAPP_UPLOAD_KEY_PASSWORD=your_password
```

4. Update `android/app/build.gradle` signingConfigs for release

**⚠️ WARNING:** If you lose the keystore, you CANNOT update the app ever!

---

## 📚 LIBRARIES & DEPENDENCIES

### Core Framework:
| Library | Version | Purpose |
|---------|---------|---------|
| React Native | 0.81.5 | Mobile framework |
| Expo | 54.0.33 | Development platform |
| React | 19.1.0 | UI library |
| TypeScript | 6.0.2 | Type safety |

### Navigation:
| Library | Version | Purpose |
|---------|---------|---------|
| expo-router | 6.0.23 | File-based routing |
| @react-navigation/native | 7.0.14 | Navigation core |
| @react-navigation/native-stack | 7.2.0 | Stack navigation |
| react-native-screens | 4.16.0 | Native screens |

### UI Components:
| Library | Version | Purpose |
|---------|---------|---------|
| @expo/vector-icons | 15.0.3 | Icons (Ionicons) |
| react-native-gesture-handler | 2.28.0 | Touch gestures |
| react-native-safe-area-context | 5.6.0 | Safe area handling |
| expo-blur | 15.0.8 | Blur effects |
| expo-haptics | 15.0.8 | Vibration feedback |

### Monetization:
| Library | Version | Purpose |
|---------|---------|---------|
| react-native-google-mobile-ads | 14.11.0 | AdMob integration |

### Features:
| Library | Version | Purpose |
|---------|---------|---------|
| expo-speech | 14.0.8 | Text-to-Speech (voice commentary) |
| expo-notifications | 0.32.16 | Push notifications |
| axios | 1.13.6 | HTTP requests |
| @react-native-async-storage/async-storage | 2.2.0 | Local storage |

### Native Modules (Custom):
| Module | Purpose |
|--------|---------|
| FloatingWidgetService.java | Draw over other apps overlay |
| FloatingWidgetModule.java | React Native bridge |
| FloatingWidgetPackage.java | Package registration |

---

## 🏗️ ARCHITECTURE

### File Structure:
```
/app/
├── frontend/                    # React Native App
│   ├── app/                     # Expo Router pages
│   │   ├── _layout.tsx          # Root layout + splash
│   │   ├── index.tsx            # Home (Live/Recent/Upcoming)
│   │   ├── match/[id].tsx       # Match detail
│   │   ├── settings.tsx         # Settings page
│   │   └── about.tsx            # About page
│   ├── src/
│   │   ├── components/          # Reusable components
│   │   ├── context/             # React contexts
│   │   │   ├── AdMobContext.native.tsx
│   │   │   ├── ProContext.tsx
│   │   │   └── NotificationContext.tsx
│   │   ├── services/            # API services
│   │   │   ├── api.ts           # Cricket API calls
│   │   │   └── FloatingWidgetService.ts
│   │   └── types/               # TypeScript types
│   ├── android/                 # Native Android
│   │   └── app/src/main/java/com/cricapp/live/
│   │       ├── MainActivity.kt
│   │       ├── MainApplication.kt
│   │       └── floatingwidget/  # Native overlay module
│   ├── assets/                  # Images, fonts
│   ├── app.json                 # Expo config
│   └── package.json             # Dependencies
│
├── backend/                     # FastAPI Server
│   ├── server.py                # API proxy with key rotation
│   └── requirements.txt         # Python dependencies
│
└── .github/workflows/
    └── build-android.yml        # GitHub Actions build
```

### Data Flow:
```
User → React Native App → Backend (FastAPI) → RapidAPI (Cricbuzz) → Response
                ↓
         AdMob SDK → Google Ads
                ↓
         Native Module → Android Overlay
```

### Key Contexts:
1. **AdMobContext** - Manages all ad loading/showing
2. **ProContext** - Manages Pro user state (30 min after 3 ads)
3. **NotificationContext** - Match notifications

---

## 🔧 DEBUGGING & DEVELOPMENT

### Local Development:
```bash
cd frontend
yarn install
npx expo start
```

### Build Commands:
```bash
# Generate native project
npx expo prebuild --platform android --clean

# Build APK (debug)
cd android && ./gradlew assembleDebug

# Build APK (release)
cd android && ./gradlew assembleRelease

# Build AAB (Play Store)
cd android && ./gradlew bundleRelease
```

### Common Debug Commands:
```bash
# Check logs
adb logcat | grep -i "cricapp\|react\|admob"

# Install APK
adb install -r app-release.apk

# Clear app data
adb shell pm clear com.cricapp.live

# Check if overlay permission granted
adb shell appops get com.cricapp.live SYSTEM_ALERT_WINDOW
```

### Key Files for Debugging:

| Issue | File to Check |
|-------|---------------|
| App crashes on load | `_layout.tsx`, `AdMobContext.native.tsx` |
| Ads not showing | `AdMobContext.native.tsx`, check AdMob IDs |
| API data not loading | `backend/server.py`, check RapidAPI keys |
| Navigation issues | `app/` folder, expo-router config |
| Overlay not working | `floatingwidget/` Java files |
| Splash screen issues | `app.json`, `SplashScreen.tsx` |

---

## 🚀 UPDATE PROCESS

### For Each Update:

1. **Increment version** in `app.json`:
```json
"version": "1.0.2",  // User visible
"android": {
  "versionCode": 2   // Must increment
}
```

2. **Test locally** using Expo Go or debug build

3. **Push to GitHub** - triggers build

4. **Download AAB** from GitHub Actions

5. **Upload to Play Console** → Production/Internal testing

### Version History:
| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Initial | Base app |
| 1.0.1 | Current | Floating widget, splash fixes |

---

## ⚠️ CRITICAL REMINDERS

1. **NEVER change package name** after Play Store upload
2. **NEVER lose signing keystore** - backup in multiple places
3. **Check RapidAPI limits** before high traffic events (IPL)
4. **Test on real device** before release (not just emulator)
5. **Keep AdMob policies** - no incentivized clicks, proper ad placement
6. **Privacy Policy required** - must be accessible via URL

---

## 📞 Support Resources

- **Expo Docs:** https://docs.expo.dev/
- **React Native:** https://reactnative.dev/docs/
- **AdMob:** https://developers.google.com/admob
- **Play Console:** https://play.google.com/console
- **RapidAPI:** https://rapidapi.com/

---

*Last Updated: April 2026*
*Document Version: 1.0*
