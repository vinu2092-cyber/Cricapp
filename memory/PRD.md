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


## 2026-04-18 (2) — v1.0.8 polish pass #2

### A. Scoreboard fonts made larger (same 20% height cap)
- `app/match/[id].tsx`
  - seriesName 11 → 13, teamName 11 → 13, teamScore 15 → 18, overs 9 → 11,
    statusTxtCentered 10 → 12, batsmenTitle 8 → 10, batsmanName 10 → 12,
    batsmanScore 11 → 13, overSummaryTitle 8 → 10.
  - teamName colour #CCC → #E8E8E8, overs #999 → #BBB for better legibility on
    the dark header.
  - teamLogo 26 → 28.

### B. Commentary / Scorecard / Squads — 30% lighter & 30% more transparent
- Global replacements across `CommentarySection.tsx`, `ScorecardSection.tsx`,
  `SquadsSection.tsx`:
  - `rgba(..., 0.60) → rgba(..., 0.30)`
  - `rgba(..., 0.70) → rgba(..., 0.40)`
  - `rgba(..., 0.50) → rgba(..., 0.25)`
- Event-card borders softened: `0.75 → 0.50`.
- Underlying base colours (light green / light red / light yellow / pastel blue)
  kept the same — with the halved opacity the background wallpaper shows
  through more, giving the requested lighter look.

### C. Header — icons below the status strip + fireball hugs the logo
- `src/components/Header.tsx`
  - Now imports `useSafeAreaInsets` and applies `paddingTop: insets.top` + grows
    the header height by `insets.top`, so the Inbox / Settings / Unlock buttons
    sit UNDER the device status bar (no more overlap with time / battery).
  - Logo size 80 → 72, LogoFireTail `size` prop also 72 so the ball orbit
    perimeter lines up exactly with the logo edge.
- `src/components/LogoFireTail.tsx`
  - Ball orbit rectangle now matches the logo's exact size (no 3% outer margin
    any more) — fireball touches the logo border.
  - Core redesigned: **one speckled rainbow fireball** with 6 multi-colour
    pixel "grains" (red / orange / yellow / green / blue / purple) painted on the
    bright core, so the ball fires multiple rainbow colours simultaneously while
    remaining visually a single ball.
  - Smoke tail unchanged in concept: 9 soft rainbow dots trailing behind the
    fireball with expanding shadow radius → rainbow-smoke look.
  - Wicket-alert mode: grains collapse to red-only + pure red halos = emergency
    red fireball.

### D. Inbox — admin broadcast was showing twice
- `src/context/InboxContext.tsx`
  - On an incoming FCM foreground message the handler stores the message in the
    inbox AND reschedules a local notification so the tray shows it. The Expo
    `addNotificationReceivedListener` then also fires for that local
    notification and was storing the message a *second* time (different IDs,
    so the id-based dedup didn't catch it).
  - Fix: the scheduled local notification now carries `_skipInbox: true` in its
    data; the Expo listener reads the flag and bails out. Result: one FCM
    broadcast = one inbox entry.

### Files changed (this pass)
- `frontend/app/match/[id].tsx` — scoreboard font bump
- `frontend/src/components/CommentarySection.tsx` — 30% transparency + softer borders
- `frontend/src/components/ScorecardSection.tsx` — 30% transparency
- `frontend/src/components/SquadsSection.tsx` — 30% transparency
- `frontend/src/components/Header.tsx` — safe-area insets + smaller logo (72)
- `frontend/src/components/LogoFireTail.tsx` — rewrite: speckled single fireball,
  orbit hugs logo edge
- `frontend/src/context/InboxContext.tsx` — `_skipInbox` flag to dedup FCM

### Next action items
1. **Press "Save to GitHub"** → GitHub Actions builds APK + AAB on `main`.
2. Install APK and verify:
   - Header: icons no longer overlap device status bar.
   - Header: single fireball with rainbow grains + rainbow-smoke tail runs
     exactly along the logo border (no visible gap).
   - Scoreboard: team names / scores / overs clearly readable; overall
     scoreboard still ≤ 20% of screen.
   - Commentary / Scorecard / Squads: wallpaper visible through tiles (~30%
     opacity), eye-friendly.
   - Firebase admin broadcast sent once → shows up once in Inbox.


## 2026-04-18 (3) — v1.0.8 polish pass #3 (premium fireball + uniform 60% tiles)

### A. Commentary / Scorecard / Squads — uniform 60% solid / 40% transparent
- Previous pass took opacities too low → wallpaper bled through and text became
  hard to read on Scorecard / Squads. Commentary tiles were untouched (solid hex
  `#FFF9C4`, `#C8E6C9`) and therefore looked fully opaque.
- This pass:
  - `CommentarySection.tsx` — `getAlternatingBg` now returns
    `rgba(255,249,196,0.60)` / `rgba(200,230,201,0.60)` (pastel yellow / green at
    60%). Containers + event-card backgrounds already at 0.60, borders restored
    to 0.75 for definition.
  - `ScorecardSection.tsx` — row palette back to 0.60; outer section 0.70.
  - `SquadsSection.tsx` — row palette back to 0.60; outer section 0.70;
    secondary tiles 0.50.
- Result: all three tabs now share the same 60/40 contrast — wallpaper
  still visible but text stays readable.

### B. LogoFireTail — smooth premium fireball with rainbow spark burst
- Removed the 6 big visible pixel grains on the fireball core (user called this
  "pixelated / kachra").
- Core is now a **single smooth fireball** = solid cream-white core + 3
  progressively-softer aura rings (outer red halo → flame → amber ring → white
  core) with native shadow for a glow feel.
- Added a **subtle rainbow spark burst**: 24 ultra-tiny (1.5–3.3 px) rainbow
  particles that radiate out from the fireball to ~2.5× its radius then fade
  back in. Each particle has its own random angle, period (1.4–2.8 s) and start
  delay, so the eye can't count them — it reads as organic fire crackle.
- Orbit path changed from a hard rectangle to a **rounded rectangle** (30
  keyframes, corner radius ≈ 18% of logo size) so it feels like it's tracing the
  logo's own rounded shape, clockwise, 30 s / revolution (5 s in wicket mode).
- Ball geometry now exactly matches the logo edge (halfOrbit = size / 2,
  containerPad only wide enough for ball + shadow) — **fireball visibly
  touches the logo border**, no floating gap.
- Smoke tail kept (9 rainbow dots) but made a touch smaller and softer for a
  cleaner premium look.

### Files changed (this pass)
- `frontend/src/components/CommentarySection.tsx`
- `frontend/src/components/ScorecardSection.tsx`
- `frontend/src/components/SquadsSection.tsx`
- `frontend/src/components/LogoFireTail.tsx`

### Next action items
1. **Press "Save to GitHub"** — Actions builds APK + AAB on main.
2. Verify on device:
   - Commentary / Scorecard / Squads → all three tabs tiles look equally
     60%-solid (wallpaper visible but text clearly readable).
   - Header logo orbit: single smooth fireball hugging the logo border, rainbow
     smoke tail behind it, occasional tiny rainbow sparks popping out and back.
   - Wicket alert → same smooth ball turns red and speeds up for 10 s.
