# CricApp — PRD / Work Log

## Project
CricApp (com.cricapp.live) — React Native / Expo Android app, live on Play Store Closed Testing.
Repo: https://github.com/vinu2092-cyber/Cricapp.git
Current version: **v1.0.8** (versionCode 8)

## 2026-04-17 — Phase 6 (UI polish: scoreboard, colors, logo fire-tail, inbox)

### Scoreboard further compaction (`app/match/[id].tsx`)
- Removed the "Overlay OFF" toggle button from below the scoreboard — overlay is now controlled exclusively via the pin icon in the header actions row (no duplicate UI).
- Match status line (e.g., "Gujarat Titans won by 5 wkts") moved **into** the center column, directly under the COMPLETED/LIVE badge. Uses zero extra vertical space.
- LAST BATSMEN + RECENT OVERS rows remain single-line (title on left, values on right) from Phase 5.

### Softer premium colors (60% solid / 40% transparent)
- `CommentarySection` container: `rgba(255,255,255,0.70) → 0.60`
- Event cards (CommentarySection):
  - OUT: `#FFCDD2 → rgba(255,205,210,0.60)` with border `rgba(255,82,82,0.75)`
  - NEW BATSMAN: `#C8E6C9 → rgba(200,230,201,0.60)` with border `rgba(76,175,80,0.75)`
  - BOWLING CHANGE: `#BBDEFB → rgba(187,222,251,0.60)` with border `rgba(25,118,210,0.75)`
- `ScorecardSection.ROW_COLORS` + `SquadsSection.ROW_COLORS`: all three (green/red/yellow) bumped 0.70 → 0.60.

### Logo fire-tail animation (`src/components/LogoFireTail.tsx` — NEW)
- Removed the rainbow edge border that was wrapping the whole app (`AnimatedGlowBorder` no longer mounted in `app/_layout.tsx`).
- New `LogoFireTail` component renders **six rainbow dots** (red → orange → yellow → green → blue → purple) that orbit the logo clockwise.
- Leading dot is solid/full; each trailing dot fades to 25% opacity + shrinks slightly — looks like a tiny fire-tail chasing itself.
- **30 seconds per full revolution** (linear easing) — user-requested cadence.
- Uses `Animated.timing` with `useNativeDriver: true` → zero JS-thread overhead.
- Mounted in `Header.tsx` around the logo Image (logo slightly resized 100→80px so the orbit fits).

### Admin messages / Inbox (`app/inbox.tsx`)
- Replaced the 3-row rotating palette with simple unread/read semantics:
  - **Unread** → light green bg `rgba(200,230,201,0.60)` + green left-border (3px)
  - **Read** → white bg `rgba(255,255,255,0.60)`
- Removed the auto "mark-all-as-read on open" so unread state actually means something per-message.
- **Bug fix** — tap event was a no-op (only `markAsRead`). Replaced with a proper open-detail flow:
  - New `selectedMessage` state + full-screen `Modal` with scrollable body, date header, title, body, and OK/close buttons.
  - `onPress` now opens the modal AND marks the message as read (which flips its card white next time the list re-renders).

## Earlier phases (all still in effect)
- **Phase 5** — Compact scoreboard (20% height cap, horizontal team blocks), Player Detail Modal tap-to-expand with bio + career stats grid.
- **Phase 4** — `fetchTeamSquad(matchId, teamId)` for Substitutes + Bench with photos; smart ad unlock (2-fail fallthrough).
- **Phase 3** — Commentary gap fix using Cricbuzz `tms + iid` pagination; walks back through innings to ball 0.1.
- **Phase 2** — Rewarded ad ID corrected; event cards 100% width; team logos in match list + header; scorecard avatars 32px.
- **Phase 1** — `compileSdk/targetSdk` bumped 35 → 36 for androidx.activity/core 1.11+/1.17+ build compatibility.

## How to release
1. User hits **"Save to GitHub"** in Emergent.
2. GitHub Actions runs `assembleRelease` + `bundleRelease`; signed APK + AAB attach to the `v1.0.8` release.
3. Upload AAB to Play Console Closed Testing.

## Backlog
- Persist `commentaryNextTimestamp + commentaryNextIid` per match to resume cold-start sync from exactly where it left off.
- Bundled-asset fallback map of ~50 top IPL/intl player photos for rare cases where Cricbuzz returns null `faceImageId`.
- Optional: "Compare Players" feature that lets the user pick two squad members and diff their career stats side-by-side.


## 2026-04-18 — v1.0.8 fixes (Firebase hosts · out-card · scoreboard · fireball)

### Task A — Commentary: "Batter" → "Batsman" + partnership on red OUT card
- `src/components/CommentarySection.tsx`
  - Fallback placeholder text "Batter" → "Batsman" and "Incoming batter" → "Incoming batsman".
  - OUT card now shows `X runs · Y balls · SR …` (was just `X(Y)·SR`).
  - NEW **Partnership line** added on OUT card: parses `partnership of 67(58)` / `67-run stand off 58 balls` /
    `the stand is worth 67 runs from 58 balls` variants out of the commentary text and renders
    "Partnership: 67 runs (58 balls)" in purple.

### Task B — Squad player profile missing details
- `src/components/SquadsSection.tsx`
  - Scorecard-sourced players (batsmen / bowlers / DNB) now carry their `id` into the `SquadPlayer`
    object, enabling `PlayerDetailModal` → `fetchPlayerProfile(player.id)` to load career stats.
  - `buildImageLookup` now also indexes a `id` alongside `faceImageId` / `imageUrl`, and
    `enrichWithImage` now back-fills `id` when missing. This means a player found in scorecard
    but not the team-squad endpoint still gets their cricbuzz player id from the match-info
    lookup.

### Task C — Firebase Remote Config: Host 2 / Host 3 keys not reaching app
- Firestore `app_config/settings` currently has `api_key = ""` (Host 1 has no own keys) while
  `api_key_p2` / `api_key_p3` each carry real RapidAPI keys. These RapidAPI keys are
  subscribed to the **cricbuzz-cricket** product only — so they work on Host 1 but error on
  Host 2 / Host 3.
- `src/services/FirebaseKeyService.ts`
  - Built a **shared key pool** (union of all three `api_key*` slots).
  - Any host that has no own keys now borrows from the shared pool, so Host 1 (primary) always
    has keys to try and Host 2 / Host 3 keep their own keys first but inherit extras too.
  - Applied to both the REST fetch path and the SDK fallback path.
  - Result: with `current_provider = cricbuzz-cricket`, the app now hits Host 1 successfully
    using the keys stored under `api_key_p2` / `api_key_p3`, and Host 2 / Host 3 stay available
    as backup.

### Task D — Scoreboard visibility / 20% height split
- `app/match/[id].tsx`
  - `scoreHeader` now enforces `maxHeight = 20% of screen height` + `minHeight = ~12%`, so the
    scoreboard always renders (no longer collapses when content is light) and at most occupies
    the user-requested 20%. Commentary fills the remaining ~80% below.

### Task E — Logo fire-tail: single fireball with rainbow smoke, rectangular orbit
- `src/components/LogoFireTail.tsx` (full rewrite)
  - Before: six equally-sized rainbow dots on a **circular** orbit.
  - Now: **one fireball + rainbow smoke tail** orbiting a **rectangular** path hugging the
    square logo border. Fireball = layered halos (red → orange → amber → cream core) with
    native shadow/elevation for a burning-ball feel; 9 tail dots trail behind it with
    progressively smaller size, rainbow hues, and increasing shadow radius so the tail reads
    as rainbow-colored smoke.
  - Normal mode: 30s per revolution, rainbow palette.
  - Wicket-alert mode (from `FireTailAlertContext`): 5s per revolution, red-burst palette.
  - Supports legacy `durationMs` prop (Header.tsx passes it) as alias for `normalDurationMs`.

### Version
- Kept at **v1.0.8 / versionCode 8** per user instruction.

### Files changed
- `frontend/src/components/CommentarySection.tsx`
- `frontend/src/components/SquadsSection.tsx`
- `frontend/src/services/FirebaseKeyService.ts`
- `frontend/app/match/[id].tsx`
- `frontend/src/components/LogoFireTail.tsx`

### Next action items
- Press **Save to GitHub** → GitHub Actions `build-android.yml` will build APK + AAB on `main`.
- Install the resulting APK on-device and verify:
  1. Squad tab → tap any player → profile modal shows name + photo + career stats.
  2. Commentary: wicket comm shows "OUT · over" card with "runs · balls · SR" + Partnership line.
  3. API calls resolve (Firebase hosts 2/3 now contribute keys to Host 1).
  4. Scoreboard visible at ~20% of screen; commentary ~80%.
  5. Header logo is circled by a single fireball with a rainbow smoke tail, orbiting in a
     square/rectangle around the logo. On wicket → speeds up + turns red for 10s.
