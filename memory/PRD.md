# CricApp — PRD / Work Log

## Project
CricApp (com.cricapp.live) — React Native / Expo Android app, live on Play Store Closed Testing.
Repo: https://github.com/vinu2092-cyber/Cricapp.git
Current version: **v1.0.8** (versionCode 8)

## 2026-04-17 — Phase 3 (Commentary Gap Recovery — THE real root cause)

### Problem
Even with Sync-on-Open in place, users reopening the app after phone sleep saw only the
latest ~10-25 balls. Walking "back" through pagination never actually reached ball 0.1.

### Root cause (confirmed via RapidAPI docs)
Cricbuzz's `mcenter/{matchId}/comm` endpoint paginates with `tms` + `iid` query params,
NOT `timestamp`. Our code was sending `?timestamp=…` — the server silently ignored it
and returned the SAME latest page every time. The loop "progressed" (because local
dedup kept reducing new-ones to 0) but never actually moved backwards in time.

### Fix
1. `fetchMoreCommentary(matchId, tms, iid)` — now sends `?tms=…&iid=…`
2. New `extractCommPagination()` pulls both `timestamp` + `inningsId` from the oldest
   ball in `comwrapper` (falls back to `miniscore.inningsid` if wrapper omits it).
3. When the server echoes the same tms within the current innings, the function
   automatically flips `iid → iid - 1` with `tms = Date.now()` so we walk backwards
   through innings 2 → innings 1 all the way to ball 0.1.
4. If no `iid` was ever supplied (unusual response shape), we fallback to `iid=1`
   as a last-ditch attempt to catch everything.
5. `Match` type carries `commentaryNextTimestamp` + `commentaryNextIid` in state.
6. `MAX_SYNC_PAGES` bumped 60 → 80 (~2000 balls) to cover 50-over × 2 innings.

### Sync-on-Open loop — key improvements
- Progressive UI update: user watches history fill in top-to-bottom as each page lands.
- Break condition tightened: only stops when we genuinely can't step iid any further.
- AppState.active listener (Phase 2) still re-arms on phone wake / task-switch.

## Earlier phases (still in effect)

### Phase 2 — UI + Ads
- Rewarded ad unit ID corrected (`/6702704058` → `/6702740458`) — this was why ads weren't loading on test device.
- Watch-ad alerts removed; button now shows spinner + is disabled mid-request.
- `ADS_REQUIRED` 3 → 2 everywhere.
- Commentary cards 100% width, `marginVertical: 12`, 13–14px fonts.
- Team logos rendered in match list + match header (Cricbuzz CDN `/i1/c{id}/team.jpg`).
- Scorecard avatars bumped 24 → 32px.

### Phase 1 — Build Fix
- compileSdk/targetSdk 35 → 36 (app.json + gradle.properties) — androidx.activity/core 1.11+/1.17+ build clean.

## How to release
1. User hits **"Save to GitHub"** in Emergent.
2. GitHub Actions runs `assembleRelease` + `bundleRelease` and attaches APK/AAB to the `v1.0.8` release.
3. Upload the AAB to Play Console Closed Testing.

## Backlog
- Player-photo fallback asset map (top ~50 IPL/intl players) for when Cricbuzz API omits `faceImageId`.
- Optional: `/mcenter/{id}/team/{teamId}` fetch for full photo-enriched squads.
- Consider caching `commentaryNextIid` + `commentaryNextTimestamp` per match so even a cold-start continues from where it left off.
