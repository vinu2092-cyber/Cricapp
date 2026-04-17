# CricApp — PRD / Work Log

## Project
CricApp (com.cricapp.live) — React Native / Expo Android app, live on Play Store Closed Testing.
Repo: https://github.com/vinu2092-cyber/Cricapp.git
Current version: **v1.0.8** (versionCode 8)

## 2026-04-17 — Phase 5 (Compact Scoreboard + Player Detail Modal)

### Compact Scoreboard — Dynamic 20% Cap
- `scoreHeader` now enforces `maxHeight: SCREEN_H * 0.20` via `Dimensions.get('window')` with `overflow: hidden` → guaranteed not to exceed 20% on any device or display-zoom setting.
- Team block redesigned: **logo + (name / score / overs) side-by-side** instead of vertical stack → ~30% vertical space reclaimed.
- Padding trimmed across the board:
  - `scoreHeader` paddingTop 8 → 4, paddingBottom 6 → 2, border 2 → 1
  - `batsmenContainer` paddingVertical 5 → 3, now horizontal row layout
  - `overSummaryContainer` paddingVertical 6 → 2, now horizontal row layout
  - `unlockBtn` paddingVertical 8 → 4, paddingHorizontal 16 → 10
- Font sizes standardised: team score 18 → 15, team name 12 → 11, batsman name 11 → 10, labels 9-10 → 8.
- Batsmen + Recent Overs rows are now single-line (title on left, values on right) instead of title-above-values stacks.
- Result: ~80% of screen reclaimed for commentary, matching Cricbuzz/Cricket-Guru visual weight.

### Player Detail Modal (tap any squad player)
- New component `src/components/PlayerDetailModal.tsx` — opens when any row in the Squads tab (Playing XI / Substitutes / Bench) is tapped.
- Pulls player profile from Cricbuzz:
  - `/stats/v1/player/{id}` → bio (name, role, batting/bowling style, intl team, DOB)
  - `/stats/v1/player/{id}/batting` → batting career by format
  - `/stats/v1/player/{id}/bowling` → bowling career by format
  - Added `fetchPlayerProfile(playerId)` in `api.ts` that parallel-fetches all three and caches the result for 2 min.
- UI:
  - 130px circular photo with green border (Cricbuzz CDN: `/i1/c{faceImageId}/player.jpg` at 192×192)
  - Name + role, CAPTAIN / WICKET-KEEPER / SUBSTITUTE badges
  - Bio box (Intl Team / Batting / Bowling / Birthplace / DOB)
  - Career stats grid: Mat / Runs / Avg / SR for batting, Mat / Wkts / Econ / SR for bowling, across all formats (Test / ODI / T20I / IPL …)
  - Graceful fallback when stats aren't available
- `SquadsSection`:
  - `SquadPlayer` type now carries `id` → used for the API call
  - Every player row wrapped in `TouchableOpacity` with `activeOpacity: 0.6`
  - Each has a unique `data-testid` like `player-t1-playing-0`, `player-t2-bench-3` etc.

## Earlier phases (all still in effect)
- **Phase 4** — `fetchTeamSquad(matchId, teamId)` powers Substitutes + Bench with photos; smart ad unlock (2-fail fallthrough → free Pro).
- **Phase 3** — Commentary Gap Fix: Cricbuzz pagination uses `tms + iid`, not `timestamp`; walks back through innings to ball 0.1.
- **Phase 2** — Rewarded ad ID corrected to `/6702740458`; 100%-width event cards (margin 12, 13–14px fonts); team logos in match list + header; scorecard avatars 24 → 32px.
- **Phase 1** — `compileSdk/targetSdk` bumped 35 → 36 for androidx.activity/core 1.11+/1.17+ compatibility.

## How to release
1. User hits **"Save to GitHub"** in Emergent.
2. GitHub Actions runs `assembleRelease` + `bundleRelease`; signed APK + AAB attach to the `v1.0.8` release.
3. Upload AAB to Play Console Closed Testing.

## Backlog
- Optional: cache `commentaryNextTimestamp` + `commentaryNextIid` per match in AsyncStorage so cold-start picks up exactly where it left off.
- Local bundled-asset fallback map of ~50 top IPL/intl player photos for cases where `faceImageId` is genuinely null from Cricbuzz.
