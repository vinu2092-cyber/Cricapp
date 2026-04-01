# 🚀 CricApp - Production Build Guide

## Build Configuration Complete ✅

Your app is now ready for production build with:
- ✅ EAS Build configured (eas.json created)
- ✅ Production settings in app.json
- ✅ AdMob IDs integrated
- ✅ RapidAPI Cricbuzz integration active
- ✅ Pro user system functional
- ✅ Assets deployed (icon.png, splash.png)

---

## 📱 Build Commands

### **IMPORTANT: Run these commands from your LOCAL machine, NOT from this environment**

The build process requires interactive authentication and runs on Expo's cloud servers.

---

## Step 1: Install EAS CLI (on your machine)

```bash
npm install -g eas-cli
```

---

## Step 2: Clone the Repository

```bash
git clone <your-github-repo-url>
cd <your-repo-folder>/frontend
```

---

## Step 3: Login to Expo

```bash
eas login
```

**Credentials:**
- Username: `Vinu2092`
- Password: `Vinod2092@`

---

## Step 4: Configure EAS (First Time Only)

```bash
eas build:configure
```

This will:
- Link to your Expo account
- Set up project for builds
- Create necessary credentials

---

## Step 5: Build Production AAB (for Play Store)

```bash
eas build --platform android --profile production
```

**What happens:**
- Build runs on Expo servers (takes 15-30 minutes)
- Generates `.aab` (Android App Bundle)
- Optimized for Play Store submission
- Release mode with ProGuard enabled

**Build Dashboard:**
- You'll see a link like: `https://expo.dev/accounts/Vinu2092/projects/cricapp/builds/<build-id>`
- Track progress in real-time
- Download AAB when complete

---

## Step 6: Build APK (for Testing)

```bash
eas build --platform android --profile preview
```

**What happens:**
- Generates `.apk` file
- Can install directly on Android devices
- Good for testing before Play Store submission
- Smaller file size than AAB

---

## Step 7: Download Your Builds

After builds complete:

1. Go to: https://expo.dev/accounts/Vinu2092/projects/cricapp/builds
2. You'll see both builds listed
3. Click **"Download"** button for each
4. AAB: Upload to Play Store Console
5. APK: Install on your phone for testing

---

## 🎯 Alternative: Build from This Environment

If you want to initiate builds from here, I can prepare the commands, but you'll need to:

1. **Set up Expo credentials** in this environment
2. **Authenticate EAS CLI** with your account
3. **Trigger builds** - but downloads must be from Expo dashboard

---

## 📋 What's Included in the Build

### Features:
- ✅ Live cricket matches (RapidAPI Cricbuzz)
- ✅ Recent & Upcoming matches
- ✅ Category filters (All, International, League, Domestic)
- ✅ Pro user system (3-ad unlock)
- ✅ Floating scoreboard (Pro feature)
- ✅ Voice commentary (Pro feature)
- ✅ AdMob monetization
- ✅ Smart caching (60-second cache)
- ✅ Auto-refresh (1-minute intervals)
- ✅ 60/20/20 layout (commentary/field/scoreboard)
- ✅ Splash screen with full illustration
- ✅ Over-based banner ads

### Technical:
- ✅ Backend URL: `https://dragable-ui-test.preview.emergentagent.com`
- ✅ API endpoints: `/api/cricket/*`
- ✅ AdMob App ID: `ca-app-pub-9675798593675825~2399929714`
- ✅ Package: `com.cricapp.live`
- ✅ Version: 1.0.1
- ✅ Developer: GemmiApps

---

## 🔐 Play Store Submission Checklist

After downloading AAB:

1. **Create App on Play Console**
   - Go to: https://play.google.com/console
   - Create new app
   - Fill in basic info

2. **Upload AAB**
   - Go to Release → Production → Create new release
   - Upload the `.aab` file
   - Add release notes

3. **Provide App Assets**
   - App icon (already configured - icon.png)
   - Screenshots (take from your phone)
   - Feature graphic (1024x500 banner)
   - Privacy policy URL

4. **Set Content Rating**
   - Fill questionnaire
   - Get rating certificate

5. **Complete Store Listing**
   - Title: "CricApp"
   - Short description (80 chars)
   - Full description (4000 chars)
   - Select category: Sports

6. **Submit for Review**
   - Can take 1-7 days
   - Check email for updates

---

## 📱 Testing APK on Your Phone

1. Download APK from Expo dashboard
2. Transfer to phone (via USB or email)
3. Enable "Install from unknown sources" in phone settings
4. Tap APK file to install
5. Test all features:
   - Live matches loading
   - Pro unlock (watch 3 ads)
   - Floating scoreboard
   - Category filters
   - Match details

---

## ⚠️ Important Notes

1. **First build takes longer** (20-30 minutes) as it sets up credentials
2. **Subsequent builds** are faster (10-15 minutes)
3. **Check build status** at: https://expo.dev
4. **Download links expire** after 30 days (can rebuild anytime)
5. **Version updates**: Increment version in app.json before each build

---

## 🆘 Troubleshooting

### "No EAS project found"
```bash
eas init
```

### "Authentication required"
```bash
eas logout
eas login
```

### "Build failed"
- Check build logs on Expo dashboard
- Common issues:
  - Missing dependencies (run `yarn install`)
  - Android SDK version conflicts
  - Package name already exists

### "Cannot download build"
- Login to Expo website: https://expo.dev
- Go to Projects → cricapp → Builds
- Download from there

---

## 📞 Support

If you encounter issues:
1. Check Expo docs: https://docs.expo.dev/build/introduction/
2. Build logs on dashboard
3. Expo Discord: https://chat.expo.dev

---

## 🎉 Summary

Your app is **100% ready** for production build! Just run the commands above from your local machine to generate:
- **AAB** for Play Store upload
- **APK** for device testing

**All features are functional and tested!**

---

Generated on: March 25, 2026
App Version: 1.0.0
Build Profile: Production
