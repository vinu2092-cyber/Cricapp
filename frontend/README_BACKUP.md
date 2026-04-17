# CricApp v1.0.7 — Master Backup & Recovery Guide
## (GitHub Safe Version — No Sensitive Keys Here)

---

## 1. App Identity

| Field | Value |
|-------|-------|
| App Name | CricApp |
| Package Name | `com.cricapp.live` |
| Version | 1.0.7 (versionCode: 7) |
| Expo Slug | `cric-app` |
| EAS Project ID | `47d65cb3-f161-4591-bbd9-9d062e96ca5d` |
| Expo Owner | `gemmiapps` |
| Play Store Status | Closed Testing (Live) |

---

## 2. Firebase Project

| Field | Value |
|-------|-------|
| Project ID | `cricapp-2092` |
| Project Number | `31510956391` |
| Storage Bucket | `cricapp-2092.firebasestorage.app` |
| Console URL | https://console.firebase.google.com/project/cricapp-2092 |
| Firestore Collection | `app_config` → Document: `settings` |

### Firebase Firestore Fields (app_config/settings):
- `api_host` — Primary RapidAPI host
- `api_host_p2` — Secondary RapidAPI host
- `api_host_p3` — Tertiary RapidAPI host
- `api_key` — Comma-separated API keys for host 1
- `api_key_p2` — Comma-separated API keys for host 2
- `api_key_p3` — Comma-separated API keys for host 3
- `current_provider` — Active provider name (e.g., "cricbuzz-cricket")

### Firebase Config File Locations:
- `/frontend/google-services.json` (root — used by Expo build)
- `/frontend/android/app/google-services.json` (Android native)

---

## 3. Signing & Build Configuration

### EAS Build Profiles (`eas.json`):
- **development** — Debug APK (internal distribution)
- **preview** — Release APK (internal, without credentials)
- **production** — AAB bundle (Play Store)

### Production Signing Key:
- **IMPORTANT**: Production signing is managed by **EAS (Expo Application Services)**
- EAS generates and stores the production keystore automatically
- To download: `eas credentials` → Select Android → Download Keystore
- **NEVER lose access to your Expo account** — it holds the production signing key

### Debug Keystore (for development only):
- Path: `/frontend/android/app/debug.keystore`
- Password: `android`
- Alias: `androiddebugkey`
- Key Password: `android`

### Play Store App Signing:
- Google Play uses **App Signing by Google Play**
- Upload key is managed by EAS
- SHA-1 and SHA-256 fingerprints available in:
  - Play Console → Setup → App signing
  - Firebase Console → Project Settings → Your apps

---

## 4. AdMob Configuration

| Ad Type | Location in Code |
|---------|-----------------|
| App Open Ad | `AdMobContext.native.tsx` line 19 |
| Interstitial Ad | `AdMobContext.native.tsx` line 20 |
| Banner Ad | `AdMobContext.native.tsx` line 21 |
| Rewarded Ad | `AdMobContext.native.tsx` line 22 |

AdMob Publisher ID: Extract from `ca-app-pub-XXXXXXXXX` prefix in code.

---

## 5. RapidAPI Configuration

### Active Hosts (Triple-Engine):
| Provider | Host | Config Name |
|----------|------|-------------|
| P1 (Primary) | `cricbuzz-cricket.p.rapidapi.com` | cricbuzz-cricket |
| P2 (Secondary) | `cricbuzz-cricket2.p.rapidapi.com` | cricbuzz-cricket2 |
| P3 (Tertiary) | `cricbuzz-real-time-cricket-api.p.rapidapi.com` | cricbuzz-real-time |

### Removed Hosts (v1.0.7):
- ~~`free-cricbuzz-cricket-api.p.rapidapi.com`~~ (Removed — not subscribed)
- ~~`cricket-live-data.p.rapidapi.com`~~ (Removed — not in Firebase)

### Key Rotation Logic:
1. Start with `current_provider` from Firebase
2. Try all 5 keys on that host
3. If all fail (429/403) → switch to next host
4. All keys managed via Firebase Firestore

---

## 6. Critical File Paths

| File | Purpose | GitHub Safe? |
|------|---------|-------------|
| `/frontend/google-services.json` | Firebase Android config | YES (already in repo) |
| `/frontend/app.json` | Expo app config, version, plugins | YES |
| `/frontend/eas.json` | EAS build configuration | YES |
| `/frontend/src/services/api.ts` | API engine, providers, endpoints | YES |
| `/frontend/src/services/FirebaseKeyService.ts` | Firebase key management | YES |
| `/frontend/src/context/AdMobContext.native.tsx` | AdMob ad units & logic | YES |
| `/frontend/src/context/NotificationContext.tsx` | Notification polling | YES |
| `/frontend/src/context/InboxContext.tsx` | FCM messaging | YES |
| **Production Keystore** | Play Store signing | **NO — stored in EAS** |
| **Google Service Account JSON** | Auto-submit to Play Store | **NO — generate from Google Cloud** |
| **RapidAPI Keys** | Cricket data access | **NO — stored in Firebase Firestore** |

---

## 7. Account Migration Guide (vinu2092 → GemmiApps)

### Step 1: Expo/EAS Account
- Current owner: `gemmiapps` (already correct in app.json)
- EAS Project ID: `47d65cb3-f161-4591-bbd9-9d062e96ca5d`
- To transfer: Login to expo.dev → Project Settings → Transfer ownership
- **CRITICAL**: Download keystore BEFORE transfer: `eas credentials`

### Step 2: GitHub Repository
- Transfer repo: Settings → Danger Zone → Transfer ownership
- Or create new repo under GemmiApps and push code
- Update any CI/CD webhooks after transfer

### Step 3: Google Play Console
- Add GemmiApps email as Admin in Play Console
- Transfer app: Play Console → All Apps → Transfer App
- SHA fingerprints remain the same (tied to signing key, not account)

### Step 4: Firebase
- Add new email as Owner: Firebase Console → Project Settings → Users
- Remove old email after verifying access
- **Firestore data stays intact** — no migration needed

### Step 5: Google Cloud (for Service Account)
- IAM → Add new email with same roles
- Regenerate service account key if needed
- Update in EAS secrets: `eas secret:push`

### Step 6: RapidAPI
- Transfer RapidAPI account or create new subscriptions
- Update API keys in Firebase Firestore

---

## 8. Recovery Procedures

### If Signing Key Lost:
- Contact Google Play support for key reset (only possible with App Signing by Google Play)
- If using EAS-managed credentials: `eas credentials` to download backup

### If Firebase Config Lost:
- Download from Firebase Console → Project Settings → Your Apps → google-services.json
- Place in `/frontend/google-services.json` AND `/frontend/android/app/google-services.json`

### If AdMob Blocked:
- Check AdMob Console → Policy Center for violations
- Ad unit IDs are in `AdMobContext.native.tsx` — can be updated there

### If API Keys Exhausted:
- Add new keys in Firebase Firestore (`api_key`, `api_key_p2`, `api_key_p3`)
- App auto-fetches new keys on next restart (no code change needed)

---

## 9. Version History

| Version | versionCode | Key Changes |
|---------|-------------|-------------|
| 1.0.7 | 7 | Triple-engine API, Squad sections, Opacity fix, Notification fix, Splash fix |

---

*This document is safe for GitHub. Sensitive credentials are documented separately (not in this file).*
*Last updated: April 15, 2026*
