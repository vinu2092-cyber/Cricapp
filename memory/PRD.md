# CricApp — PRD & Fix Log

## Problem Statement (from user)
React Native/Expo Android app (CricApp) is live on Play Store Closed Testing. 
AdMob ads integrated: App Open, Interstitial, Rewarded, Banner. 
**Issue**: App Open Ad and Rewarded Ad are not showing to users → revenue zero. 
Banner & Interstitial work fine.

## Core Requirements
1. Restore App Open Ad and Rewarded Ad delivery.
2. Don't touch banner/interstitial (already working).
3. All changes must push directly to GitHub (`vinu2092-cyber/Cricapp`) — no EAS, no web preview. GitHub Actions builds APK/AAB automatically on push.
4. Work ONLY in the root directory tied to the GitHub repo (`/app`).
5. Don't break the existing working app.

## Architecture (Verified)
- **Frontend**: Expo 54 / React Native 0.81.5, expo-router v6, TypeScript
- **Ads**: `react-native-google-mobile-ads` 14.11.0 + UMP Consent
- **Package**: `com.cricapp.live`
- **App ID**: `ca-app-pub-9675798593675825~2399929714`
- **Build Pipeline**: GitHub Actions → assembleRelease + bundleRelease → upload APK+AAB + create release
- **Keystore**: Stored as `RELEASE_KEYSTORE_B64` GitHub secret

## Ad Unit IDs (Verified — DO NOT CHANGE)
| Type | Unit ID |
|------|---------|
| App Open | `ca-app-pub-9675798593675825/4826782503` |
| Interstitial | `ca-app-pub-9675798593675825/8438724452` |
| Banner | `ca-app-pub-9675798593675825/8616886104` |
| Rewarded | `ca-app-pub-9675798593675825/6702704058` |

## Fix History

### 2026-04-19 — v1.0.11 (current) — AdMob Ads Restore
- **Root cause**: v1.0.10 introduced 4 bugs in `AdMobContext.native.tsx` (aggressive parallel loads, same-instance reload, orphan App Open preload, 1s rate-limit retry).
- **Fix**: Reverted `AdMobContext.native.tsx` to v1.0.8 proven working pattern. Fixed `_layout.tsx` race condition. Bumped version to 1.0.11.
### 2026-04-23 — v1.0.13 rev-2 — Banner #1 Rescue + Over-Separator
- **Trigger**: New AdMob daily report — Banner #1 logged **0 requests** for the entire day. ANCHORED_ADAPTIVE_BANNER was silently failing on real devices.
- **Fixes**:
  - Banner #1 format: `ANCHORED_ADAPTIVE_BANNER` → **BANNER (320×50)** (highest-compat fixed size).
  - Banner #1 now ALSO renders as a natural over-separator in commentary — at every over transition (last ball of over N → first ball of over N+1), one Banner #1 strip drops in. 10-row minimum gap between two banners + per-instance stagger (4s + 2s × index) to force AdMob creative rotation.
  - Upcoming-match analysis cards: Banner #1 injected every 5 cards.
  - Banner #2 format: `INLINE_ADAPTIVE_BANNER` → **MEDIUM_RECTANGLE (300×250)**.
  - Banner #3 (`7614346881`) REMOVED — its over-separator role now handled by Banner #1.
  - `app.json`: version `1.0.12` → `1.0.13`, versionCode `12` → `13`.
  - Release workflow tag/notes bumped to v1.0.13 with this plan.
- **Expected outcome**: Banner #1 requests should jump from ~0/day to ~20+/full T20 match (1 header + 1 per over across ~6 rendered over-breaks per user session, plus analysis-card injections on upcoming pages).
- **Verification**: `tsc --noEmit` passes for all touched files. NO testing agent, NO web preview, NO EAS build per strict user directive.
- **Status**: Awaiting user "Save to GitHub" → CI builds v1.0.13 → upload to Play Console.


- **Files changed**: `frontend/src/context/AdMobContext.native.tsx`, `frontend/app/_layout.tsx`, `frontend/app.json`, `.github/workflows/build-android.yml`, `ADMOB_FIX_v1.0.11.md`
- **Status**: Pushed → GitHub Actions build → APK/AAB. User must test on device with `adb logcat | grep AdMob` to verify ads loading.

### Previous attempts (not by me — documented for context)
- v1.0.10 ADMOB_FIX_SUMMARY.md claims package name fix + APPLICATION_ID injection. Those WERE correct changes and are preserved. But the parallel AdMob logic tweaks INTRODUCED the current bugs.

## Next Action Items
1. **User**: Click "Save to GitHub" → wait for Actions build (~7-10 min) → install APK on device.
2. **User**: Capture `adb logcat | grep -E "AdMob|AppOpen"` for 60s after app launch and share if ads still don't show.
3. **Verify in AdMob Console** (1–2 hours after install): App Open + Rewarded impressions > 0.

## Backlog / Future
- Consider moving App Open Ad to a proper preload-and-cache pattern (store `AppOpenAd` in a ref, show cached on app foreground resume).
- Add eCPM floor monitoring in AdMob console.
- Consider mediation waterfall (Meta Audience Network, AppLovin) if AdMob fill remains low.

## 2026-04-19 Update — User shared AdMob screenshots

### Additional Root Causes Discovered (from AdMob console)
1. **eCPM floor $2.00** set on both AppOpenAd and UnlockProAd (Rewarded) — blocks 90%+ ads in low-CPM markets (India etc). This is the PRIMARY reason ads stopped showing even after code fix.
2. **AppOpenAd has 0 active mediation groups** (other ads have 1) — may contribute to lower fill.
3. Ad Activity Report confirms: match rate crashed from 100% → 0% on April 17 (same day buggy code pushed).

### User Decision
- Keep version at **1.0.10 / versionCode 10** (reverted from my 1.0.11 bump).
- User will upload this to Play Store Closed Testing.

### Action Items for User
1. Lower eCPM floor on AppOpenAd and UnlockProAd from $2 to $0.10 (or disable)
2. Remove/lower 246 country-specific eCPM floors
3. (Optional) Create mediation group for App open format
4. Click "Save to GitHub" to trigger build #102+ with fixed code
5. Install APK and verify via `adb logcat | grep AdMob`

See `/app/ADMOB_CONSOLE_FIX_REQUIRED.md` for full details.

## 2026-04-19 18:20 — Build #101 Successfully Pushed & Built

- Commit `6f8a5e7` (my final commit) pushed to GitHub successfully after user re-clicked Save to GitHub
- GitHub Actions build #101 completed in 7m 44s
- APK (39.1 MB) and AAB (40.1 MB) artifacts generated successfully
- User has confirmed: App Open, Banner, Interstitial ads now working after eCPM floor fix to "Google optimised"
- Rewarded ad still failing in OLD v1.0.10 APK on user's device — but new APK from build #101 has the v1.0.8 pattern code fix
- **Next**: User to download APK from build #101 artifacts, install on phone, test Rewarded ad

## Expected outcome
- Rewarded ad should load within 3-5 seconds of app launch (pre-load pattern)
- On failure, 5-30s randomized backoff with FRESH instance (not aggressive 1s retry that triggered AdMob rate-limit)
- No more 3x parallel load storm at 0s/3s/8s
- No more same-failed-instance reload (creates fresh RewardedAd.createForAdRequest each time)

## 2026-04-19 18:45 — Scoreboard Overlap + Cut-off Fix (v1.0.10)

### Issues reported (from user screenshots)
1. Yellow series name "County Championship Division One 2026" at top was useful but green `statusText` ("Day 3: Lunch Break - Hampshire lead by 215 runs") was rendered in the narrow `centerCol` between team scores — causing overlap with team logos, and bleeding onto the batsmen row on other layouts (BAN vs NZ: "New Zealand won by 26 runs" visually touched "*Nahid Rana 0(3)").
2. Team scores (HAM 238/10, SOM 288/10) ran off-screen on smaller / zoomed phones because `teamBlock` had no shrink constraint and score fonts were fixed at 18.
3. RECENT over-history strip at the bottom of the scoreboard was being clipped on short screens because the scoreboard's `maxHeight = 30% of screen` didn't leave room for it.

### Fix (surgical, scoreboard-only — no logic changes)
- **Promoted `statusText` to top header row** in place of `seriesName` (new `headerStatus` style: green, italic, bold, full-width). Falls back to series name only when status text is empty.
- **Removed `statusText` from `centerCol`** so the centre only holds the LIVE/COMPLETED badge → team blocks claim the extra horizontal space.
- **`teamBlock` → `flexShrink: 1, minWidth: 0, gap: 5`** and **`teamMeta` → `flexShrink: 1, minWidth: 0`** so long scores can shrink within their lanes instead of overflowing.
- **Team score Text**: added `numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}` — auto-scales score from 17pt down to ~13pt only when needed.
- **Team logo**: 28×28 → 26×26; team name font 13→12; overs font 11→10 — all within readability but reclaim ~6px of width per side.
- **Smart max-height**: `IS_SHORT_SCREEN = SCREEN_H < 700` → scoreboard max is `34% * SCREEN_H` on short/zoomed phones, `28%` otherwise (was flat 30%). Commentary gets the rest (≥66%).
- **Batsmen + over-summary row** paddings tightened (vertical `3→2`, over-summary min-height `22→20`, title minWidth `52→48`).
- **`batsmanItem`** gets `flexShrink: 1, minWidth: 0` for long names.

### Files changed
- `frontend/app/match/[id].tsx` — header row JSX, centerCol JSX, team JSX numberOfLines/adjustsFontSizeToFit, style sheet (`headerStatus`, `centerCol`, `teamBlock`, `teamMeta`, `teamName`, `teamScore`, `overs`, `batsmenContainer`, `batsmanItem`, `batsmanName`, `batsmanScore`, `overSummaryContainer`, `overSummaryTitle`, `overSummaryScroll`, `SCOREBOARD_MAX_HEIGHT` + `SCOREBOARD_MIN_HEIGHT`).

### Version unchanged per user request: 1.0.10 / versionCode 10.

### Testing path
1. User clicks Save to GitHub → build #102 triggers with commits `f8c683e`, `004837c`.
2. Download CricApp-APK artifact from Actions → sideload on small / zoomed Android device.
3. Open a live / completed / upcoming match:
   - Top header row now shows the status ("Day 3: Lunch Break - Hampshire lead by 215 runs") in green italic.
   - Team scores fit on one line without being cut by side edges.
   - RECENT over-history strip visible and horizontally scrollable.
   - Scoreboard visibly shorter → commentary below has more vertical space.

## 2026-04-19 19:45 — Commentary Data + Ad Placement + Scoreboard Scroll Fixes

### User-reported bugs
1. Recent / completed matches showed the **same over number twice** with different bowlers (e.g. 19.4 Brijesh Sharma + 19.4 Vaibhav Arora). Root cause: Cricbuzz API returns commentary from multiple innings for finished matches, and the app concatenated them without filtering by innings.
2. Commentary words like **OUT / WICKET / CAUGHT / BOWLED** were colored RED on EVERY row — including metaphorical prose in narrative ("banged in short and at the stumps", "thrown out", etc.) — even when no wicket actually fell on that ball.
3. Banner ad placement was "every 6 rows" — user wants **start of every over** (cricbuzz-style over break).
4. Scoreboard was **sticky at top** while commentary scrolled — user wants the scoreboard to scroll with the page like Cricbuzz web.

### Fixes shipped
- **`frontend/src/types/match.ts`** — Added `inningsId?: number` to `Commentary` interface.
- **`frontend/src/services/api.ts`** — `parseCommentaryCricbuzz` now captures `inningsid` / `inningsId` / `iid` per ball (covers both API shapes).
- **`backend/server.py`** — Both commentary endpoints now forward `inningsid` in the normalized payload (defensive: for any future consumer of the backend).
- **`frontend/src/components/CommentarySection.tsx`**
  - `parseRichText(text, isWicketRow)` — RED color on wicket keywords only when `isWicketRow=true`.
  - `RichCommentaryText` accepts `isWicketRow` prop; only the wicket event-card passes it.
  - `displayedCommentary` computed with `React.useMemo` — filters to only the LATEST innings (`Math.max(...inningsIds)`) when the feed contains multiple. Rows without `inningsId` are kept defensively.
  - Replaced `showBannerEvery6 / showBannerBefore` flags with **`shouldShowBannerForItem(item, index)`** — returns true at index 0 AND whenever `Math.floor(overFloat)` crosses a new integer (= start of a new over).
- **`frontend/app/match/[id].tsx`**
  - Removed `stickyHeaderIndices={[0]}` from the main ScrollView — scoreboard now scrolls with the page.
  - `scoreHeader` style: removed `maxHeight` + `overflow:'hidden'` so batsmen row & RECENT over strip are always fully visible (since scoreboard no longer eats commentary space when scrolled).

### Deferred (user asked for full Cricbuzz visual redesign)
- Cricbuzz-style scoreboard card (blue background, large white score, partnership bar, batter + bowler stat tables, CRR).
  This is a larger UI task — will ship in a follow-up iteration once the user confirms the current data-correctness fixes are working on device.

### Version unchanged: 1.0.10 / versionCode 10 per user preference.


---

## 2026-02 — v1.0.11 concise commentary fix

### User-reported issue
Commentary box mein "FOUR / SIX / 1-2-3 runs / direction" jaisi crisp outcome info kabhi kabhi miss ho rahi thi. Top badge toh dikhta tha ("SIX") par paragraph mein flowery metaphor-heavy description hoti thi jisme key info dab jaati thi. User ne bola: ek hi paragraph rahe, short-medium length, essential info (bowler→batter, runs, direction, fielder) ho, no tukkebaazi, no doubling.

### Root cause
`CommentarySection.tsx` ki dedupe logic same ball ke sabse LAMBE (v3, ~300-400 chars) Cricbuzz commentary version ko pick kar rahi thi — aur v3 often crisp outcome words drop kar deti hai enrichment mein.

### Fix shipped — `frontend/src/components/CommentarySection.tsx`
- **`scoreVersion(text)` helper** — per-ball version scoring. Ideal length ~120 chars, bonus for "Bowler to Batter" lead-in, bonus for outcome keyword in first 60 chars, penalty for >250 chars. Dedupe ab **highest-scoring** (≈ medium-length structured) version pick karta hai, not longest.
- **`buildStructuredPrefix(item)` helper** — API ke structured `event` / `runs` / `extras` fields se crisp outcome prefix banata hai (`"FOUR! "`, `"SIX! "`, `"OUT! "`, `"1 run. "`, `"No run. "`, `"Wide. "`, etc.). Added to display text ONLY when text itself doesn't already state outcome in first 50 chars. Scoreboard-accurate, no text-based guessing.
- **`trimLongCommentary(text, 220)`** — fallback trim at sentence boundary if picked version still too long.
- Applied in regular ball commentary render path only. OUT / new-batsman / bowler-change event cards aur stats blocks untouched.
- Highlight logic verified — `detectEventType` strict on `item.event === 'wicket'`, no text-match false positives. `parseRichText` doesn't color OUT/FOUR/SIX keywords based on text.

### Version: 1.0.11 (unchanged — user confirmed not yet uploaded)




---

## 2026-04-20 — v1.0.11 Banner+Native alternating rotation

### User request
Banner ads wapas laane hain (pehle v1.0.11 mein remove kar diye the). Naya Banner #2 ID bhi user ne AdMob mein banaya. Alternating rotation chahiye:

| Slot | Format | Ad Unit ID | Location |
|------|--------|------------|----------|
| 0 | Banner (MEDIUM_RECTANGLE 300×250) | `ca-app-pub-9675798593675825/8616886104` | Match screen top (below scoreboard) |
| 1 | Native Advanced (Videoads1) | `ca-app-pub-9675798593675825/9123709995` | 1st commentary over-break, upcoming analysis, empty state |
| 2 | Banner (MEDIUM_RECTANGLE 300×250) | `ca-app-pub-9675798593675825/2958604357` (new) | Scorecard mid, 2nd over-break |
| 3 | Native Advanced (Videoads2) | `ca-app-pub-9675798593675825/1049778852` | Squads mid, 3rd over-break |
| 4+ | cycle repeats (0→1→2→3→0…) |

Native Advanced #3 (`6409916742`) deleted from AdMob — removed from code.

### Fix shipped
- **`src/services/NativeAdRotator.ts`** — rewritten. New `AD_ROTATION` array with 4-slot banner+native alternation. Exposes `resolveAdSlot(index) → {kind, unitId, label}`. Legacy `pickNativeAdUnit`/`getNextNativeAdUnit` kept as back-compat shims.
- **`src/components/NativeAdCard.tsx`** — dispatches on `slot.kind`:
  - `banner` → renders `<BannerAd size={MEDIUM_RECTANGLE} />`, hides on error.
  - `native` → existing `<NativeAdView>` flow.
  - Refactored into `BannerSlot` + `NativeSlot` sub-components. Public API unchanged.
- **`src/components/ScorecardSection.tsx`** — ad now `slotIndex={2}` (Banner #2).
- **`src/components/SquadsSection.tsx`** — ad now `slotIndex={3}` (Native #2).
- **`app/match/[id].tsx`** — top ad stays `slotIndex={0}` (Banner #1), comment updated.
- CommentarySection over-break counter untouched; cycles through Native #1 → Banner #2 → Native #2 → Banner #1.

### AdMob policy
- First commentary over-break ad skipped on the very first ball row → ≥1 over of content between top banner and next ad.
- Format alternates every slot → no back-to-back same-format ads.
- Failed loads collapse the slot silently.

### Version: 1.0.11 unchanged


---

## 2026-04-21 — v1.0.11 cold-start perf + banner-only ad rotation

### User reports
1. **Old phones slow cold start** — app takes very long to open; suspected too much simultaneous data loading.
2. **Banner + Native ad fill rate abysmal** (screenshot: Videoads1 = 0 impressions / 24 requests, Videoads2 = 0 / 72, Banner1 = 2 / 75 → 4% match). User deleted Videoads1 + Videoads2 from AdMob; created new Banner #3 (`7614346881`). Asked to move to pure-banner alternating rotation.

### Fix 1 — Cold start perf (`app/_layout.tsx`)
Root cause: `AppWithSplash` forced a hardcoded **1800 ms native splash + 2500 ms custom splash = 4.3 s** cosmetic wait before React even started rendering the home screen. On old phones, JS bundle parse + first `fetchLiveMatches()` API call stack on top of that → **8-10 s perceived freeze** on cold start.
- Native splash reduced **1800 ms → 600 ms** (one frame enough for the handoff).
- Custom splash reduced **2500 ms → 800 ms** (branded image still visible, just faster).
- Total splash time: **4.3 s → 1.4 s** — saves ~2.9 s on every cold start, old phones benefit most.
- **Zero changes** to API code, commentary pipeline, or index.tsx fetch logic — strictly per user constraint ("commentary logic bilkul mat chhedo").

### Fix 2 — Banner-only alternating rotation
Native Advanced (Videoads1, Videoads2) completely removed from code per user spec.

| Slot | Ad ID | Size |
|------|-------|------|
| 0 | `ca-app-pub-9675798593675825/8616886104` (Banner #1) | MEDIUM_RECTANGLE 300×250 |
| 1 | `ca-app-pub-9675798593675825/2958604357` (Banner #2) | ANCHORED_ADAPTIVE_BANNER (auto width) |
| 2 | `ca-app-pub-9675798593675825/7614346881` (Banner #3, new) | MEDIUM_RECTANGLE 300×250 |
| 3+ | cycle repeats |

Placements unchanged from prior build (top of match, commentary over-breaks, scorecard mid, squads mid, upcoming analysis, empty state). "Different creatives per slot" is automatic — each slot uses a different AdMob unit ID + AdMob's built-in creative refresh.

**Files changed:**
- `src/services/NativeAdRotator.ts` — rewritten to 3-slot banner-only rotation with per-slot `size: 'medium' | 'adaptive'`. New `resolveBannerSize()` helper maps to SDK `BannerAdSize` enum. Legacy export names (`NATIVE_AD_UNIT_IDS`, `pickNativeAdUnit`, etc.) retained as back-compat shims.
- `src/components/NativeAdCard.tsx` — completely rewritten. All `NativeAd` / `NativeAdView` / `NativeMediaView` code removed. Now a pure `<BannerAd />` renderer that picks size from slot descriptor. Adaptive slot uses `useWindowDimensions` for width. Failed loads collapse silently. Component name kept (`NativeAdCard`) so call sites don't break.

### AdMob policy safeguards preserved
- First commentary over-break ad still skipped on the very first ball row.
- Different unit IDs per slot → no back-to-back identical creatives.
- Banner uses Google's own Ad badge + AdChoices chrome.
- Failed loads hide → no empty boxes.

### Version: 1.0.11 unchanged (not yet uploaded)




---

## 2026-04-21 (part 2) — v1.0.12 inline loader fix for old phones

### User report (with photos)
Screenshots showed full-screen white spinner with "Loading cricket matches…" on initial home screen load, every tab switch (Live ↔ Recent ↔ Upcoming), and after match clicks. On old/small phones this felt like a constant "loading-loading-loading" loop because header + tab bar + league chips all disappeared behind the white spinner for 3-5s per interaction.

### Fix shipped — `app/index.tsx`
- Removed early `if (loading) return <FullScreenSpinner />` block.
- Chrome (`<Header />`, tab bar, league chips, search, auto-refresh banner, Footer) now always renders immediately on mount.
- Loading state moved into `FlatList.ListEmptyComponent` — a small inline `ActivityIndicator + "Loading cricket matches…"` tile inside the list slot. When data arrives the list populates and the spinner disappears naturally.
- Error state still uses full `ErrorScreen` (terminal state blocks interaction anyway).
- Tab switches feel instant because the scaffold never flickers away.

Zero changes to: commentary pipeline, `api.ts` fetch logic, match screen, splash, ad rotation.

### Version: 1.0.12 unchanged
