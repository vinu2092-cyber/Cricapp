# CricApp v1.0.11 — AdMob Ads Restore Fix

## Problem
- **App Open Ad** aur **Rewarded Ad** users ko nahi dikh rahe the.
- Banner aur Interstitial theek kaam kar rahe the.
- 16-17 April 2026 tak v1.0.7/1.0.8 mein ye dono ads properly dikh rahe the.
- Revenue zero ho gaya.

## Root Cause (v1.0.8 → v1.0.10 comparison via git diff)

Pichle agent ne `AdMobContext.native.tsx` mein 4 CRITICAL bugs introduce kiye:

### Bug 1 — Rewarded Ad "same failed instance reload"
```tsx
// ❌ BROKEN (v1.0.10)
ad.addAdEventListener(AdEventType.ERROR, () => {
  setTimeout(() => { ad.load(); }, 1000);  // SAME failed instance
});
```
`react-native-google-mobile-ads` rules: ek failed ad instance ko dobara load nahi kar sakte — fresh instance chahiye.

### Bug 2 — Aggressive parallel loads (AdMob throttling trigger)
```tsx
// ❌ BROKEN — 3 parallel loads
setupAndLoadRewardedAd();                          // 0s
setTimeout(() => setupAndLoadRewardedAd(), 3000);  // 3s
setTimeout(() => setupAndLoadRewardedAd(), 8000);  // 8s
```
AdMob teen parallel requests ko abuse detect karke no-fill return karta hai.

### Bug 3 — Orphan App Open Ad preload
```tsx
// ❌ BROKEN — preload reference lose ho raha
const appOpenAd = AppOpenAd.createForAdRequest(...);
appOpenAd.load();   // ref kahin save nahi — orphan

// Phir showAppOpenAd() naya instance banake DUSRA load karta hai
// Do parallel App Open Ad requests → AdMob blocks
```

### Bug 4 — 1-second retry rate-limit
```tsx
// ❌ BROKEN
const retryDelay = 1000;  // 1 sec flat — AdMob ke liye abuse
```

### Bug 5 — `_layout.tsx` race condition
```tsx
// ❌ adShown flag baad mein set ho raha
showAppOpenAd()
  .then(() => setAdShown(true))
// Between trigger & resolution, re-renders se duplicate call possible
```

## Fix (v1.0.11)

**Sirf 3 files changed, surgical revert to v1.0.8 proven pattern:**

1. `frontend/src/context/AdMobContext.native.tsx`
   - Rewarded Ad error handler: fresh `setupAndLoadRewardedAd()` call (new instance)
   - Randomized 5–30s retry backoff (instead of 1s flat)
   - Removed 3s/8s parallel retry loops
   - Removed orphan App Open Ad preload block
   - Removed unused `TestIds` import

2. `frontend/app/_layout.tsx`
   - `setAdShown(true)` ab IMMEDIATELY call hota hai, await ke pehle
   - `showAppOpenAd` useEffect deps se hata (reference har render pe change hota tha)

3. `frontend/app.json`
   - version: `1.0.10` → `1.0.11`
   - versionCode: `10` → `11`

4. `.github/workflows/build-android.yml`
   - Release tag: `v1.0.10` → `v1.0.11`

## Kya NAHI Change Hua (intentional)
- ✅ Ad Unit IDs — sab correct, AdMob console se verified
- ✅ Package name `com.cricapp.live` — build.gradle + google-services.json mein match
- ✅ APPLICATION_ID + AD_ID manifest injection (workflow step)
- ✅ Banner ad (MEDIUM_RECTANGLE)
- ✅ Interstitial ad (50-60 clicks trigger)
- ✅ UMP Consent flow
- ✅ Firebase Messaging (notifications ke liye, ads se unrelated)

## Verification After Build

GitHub Actions build ke baad, APK install karke `adb logcat` filter:

```bash
adb logcat | grep -E "AdMob|AppOpen"
```

Expected lines:
```
[AdMob] SDK initialized successfully
[AdMob] SDK ready - setting up rewarded ad. Ad Unit: ca-app-pub-9675798593675825/6702704058
[AdMob] REWARDED AD LOADED SUCCESSFULLY!     ← Rewarded ad ready
[AppOpenAdHandler] SDK ready, showing App Open Ad...
[AdMob] App Open Ad flow complete             ← App Open shown
```

Agar `[AdMob] Rewarded preload ERROR: code=no-fill` dikhe toh AdMob console pe ad unit status check karein.

---

**Build**: #102+ (Save to GitHub → GitHub Actions auto-build)  
**Fix Date**: 2026-04-19  
**Approach**: Surgical revert to v1.0.8 (last known working April 17) — no experiments, no guesswork.
