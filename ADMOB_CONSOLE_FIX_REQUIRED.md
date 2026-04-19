# CricApp — AdMob Console Action Items

**Date**: 2026-04-19  
**Status**: Code fix done (v1.0.10). User must apply AdMob console fixes below.

## 🚨 CRITICAL: eCPM Floor is Blocking Revenue

Screenshots se confirm hua:
- **AppOpenAd**: Global eCPM floor = **$2.00** + 246 country floors
- **UnlockProAd (Rewarded)**: Global eCPM floor = **$2.00** + 246 country floors

**Impact**: Indian/SE Asia market mein App Open & Rewarded ad eCPM typically $0.30–$1.50.  
$2 floor → 90%+ ads filter out → match rate 0% → revenue $0.

### Action 1 (MOST IMPORTANT)

1. AdMob Console → Apps → CricApp → Ad units
2. For **UnlockProAd**:
   - Edit → Advanced settings → eCPM floor
   - Set Global floor: **$0.10** (or disable entirely)
   - Remove all 246 country-specific floors (or set each to $0.10)
3. For **AppOpenAd**: same steps as above

**Rationale**: Start low to let revenue flow, then after 2 weeks analyse & raise floor based on actual data.

## Data Proof (from Ads Activity Report)

| Date | AppOpenAd match | UnlockProAd match | RandomInterstitial match |
|------|-----------------|-------------------|--------------------------|
| 12/04 | 100% | 100% | 100% |
| 13/04 | 100% | 100% | 100% |
| 14/04 | 100% | 100% | 87.5% |
| 15/04 | 100% | 100% | 100% |
| 16/04 | 100% | 100% | 35.71% |
| 17/04 | — | **0.00%** | **0.00%** |
| 18/04 | **0.00%** | 1.72% | **0.00%** |

Crash on April 17 = exactly when buggy code was pushed. From 18th eCPM floor likely raised too.

## Action 2 (Optional Fix)

AppOpenAd mein **0 active mediation groups** hain (baaki 3 ads me 1 active).

1. AdMob Console → Mediation → Create mediation group
2. Ad format: **App open**
3. Platform: Android
4. App: CricApp
5. Ad sources: AdMob Network (default bidding enabled)
6. Save

## Action 3 (Already Done — Code)

`AdMobContext.native.tsx` reverted to v1.0.8 working pattern. No more:
- Parallel 0/3/8s rewarded ad loads
- Same-instance `ad.load()` retry on error
- Orphan App Open Ad preload
- 1-second rate-limit-triggering retry

Package name, ad unit IDs, manifest injection — all preserved from v1.0.10.

## Verification

After Save to GitHub → build → install APK:

```bash
adb logcat | grep -E "AdMob|AppOpen"
```

Expected within 10 seconds of app launch:
```
[AdMob] SDK initialized successfully
[AdMob] REWARDED AD LOADED SUCCESSFULLY!
[AppOpenAdHandler] App Open Ad flow complete
```

If you still see `ERROR: code=no-fill` → eCPM floor is still too high, lower it further.

## Verified Ad Unit IDs (no changes needed)

| Unit | ID |
|------|-----|
| App ID | `ca-app-pub-9675798593675825~2399929714` |
| AppOpenAd | `ca-app-pub-9675798593675825/4826782503` |
| RandomInterstitial | `ca-app-pub-9675798593675825/8438724452` |
| CommentaryBanner | `ca-app-pub-9675798593675825/8616886104` |
| UnlockProAd (Rewarded) | `ca-app-pub-9675798593675825/6702704058` |
