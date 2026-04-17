# CricApp — PRD / Work Log

## Project
CricApp (com.cricapp.live) — React Native / Expo Android app, live on Play Store Closed Testing.
Repo: https://github.com/vinu2092-cyber/Cricapp.git
Current version: **v1.0.8** (versionCode 8)

## 2026-04-17 — Phase 4 (Full Squads + Smart Ad Unlock)

### Squads — Substitutes & Bench now visible (Cricbuzz parity)
**Root cause:** The base `/mcenter/v1/{matchId}` endpoint only returns Playing XI for
many matches. Substitutes / Bench / Reserves live on a different endpoint that the
Cricbuzz mobile app uses for its dedicated Squads tab.

**Fix:**
1. Added `fetchTeamSquad(matchId, teamId)` → `/mcenter/v1/{matchId}/team/{teamId}` with 120s cache.
2. Wired endpoint type `'team'` through `fetchData` (added `teamId` arg + new `team` switch case in `getEndpointForType`).
3. `SquadsSection` now triggers BOTH teams' squad fetches in parallel after match info loads, then merges the rich squad data (Playing XI + Substitutes + Bench + Support Staff) on top of the basic detail response.
4. `ScorecardSection.loadPlayerImages` and `app/match/[id].tsx loadPlayerImageMap` also call `fetchTeamSquad` so batter/bowler avatars + commentary event-card photos render for incoming substitutes too.
5. `deepExtractPlayers` extended to handle additional key names (`Reserves`, `support staff`, `12th man`) and uses Cricbuzz's `id` field as a `faceImageId` fallback.

### Smart Ad Unlock — fix for "free access without watching ads"
**Old behaviour:** every tap incremented the watched count regardless of whether an ad
actually played → user got Pro after just 2 quick taps without seeing any ads.

**New behaviour (in `app/index.tsx`):**
- `showRewardedAd()` returns `true` only when `EARNED_REWARD` fires.
- Tap → ad shown → `localAdsWatched +1`. After 2 watched ads → Pro unlocked.
- Tap → ad failed (no fill / timeout) → `adFails +1` + a non-blocking toast.
- After 2 consecutive ad-load failures → free Pro auto-unlocked (so the user is never
  stuck behind Google's ad inventory).
- Loading spinner + disabled button state preserved during ad request.
- Test ad behaviour: AdMob test devices that don't get a fill simply hit the 2-failure
  fallthrough path and unlock automatically — production users with real fills go
  through the normal 2-ads flow.

## Phase 3 (still in effect) — Commentary Gap Recovery
- `fetchMoreCommentary(matchId, tms, iid)` uses correct Cricbuzz pagination params (`tms`+`iid`).
- Walks back through innings (`iid → iid-1`) until ball 0.1.
- AppState.active listener re-arms sync on phone wake.
- MAX_SYNC_PAGES 60 → 80 (~2000 balls, covers 50-over × 2 innings).

## Phase 2 (still in effect) — UI + Ads basics
- Rewarded ad unit ID corrected (`/6702704058` → `/6702740458`).
- Blocking "Ad Not Available" alerts removed; silent fall-through.
- 100% width event cards with `marginVertical: 12`, 13–14px fonts.
- Team logos rendered in match list + match header.
- Scorecard avatars bumped 24 → 32px.

## Phase 1 (still in effect) — Build Fix
- compileSdk/targetSdk 35 → 36 (app.json + gradle.properties).

## How to release
1. User hits **"Save to GitHub"** in Emergent.
2. GitHub Actions runs `assembleRelease` + `bundleRelease` and attaches APK/AAB to the `v1.0.8` release.
3. Upload the AAB to Play Console Closed Testing.

## Backlog
- If a player is in a squad but `faceImageId` is genuinely `null` from Cricbuzz (rare
  for fresh callups), consider a small bundled fallback asset map for top ~50 IPL/intl
  players.
- AdMob test-device hashed ID could be added to `requestConfiguration` for the user's
  own dev device so ads show during testing — but this only matters during dev.
