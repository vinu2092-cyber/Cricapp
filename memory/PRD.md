# CricApp — PRD (Product Requirements)

## Original Problem
Native Android cricket-scores app (React Native + Expo SDK 54) live on the Play
Store (`com.cricapp.live`). User wants v1.0.17 adding a Live Shoutbox / quick-chat
feature on every match scoreboard with strict Firebase Spark-plan-safe rules
and ≤ 25 MB APK size. Build must auto-start on push to `main` via the existing
`.github/workflows/build-android.yml` (no EAS, no web preview).

## v1.0.17 — Live Shoutbox (Quick Chat) ✅ implemented (Jan 2026)

### Core requirements (static)
- Firebase Realtime DB ONLY (NEVER Firestore for chat).
- Per-match isolated chat rooms `/chat/{matchId}/messages`.
- No user profiles in Firebase. Name + flag stored locally via AsyncStorage.
- No PNG/GIF/MP4 for animations. Only `lottie-react-native` JSONs (~3 KB each).
- `limitToLast(10)` on every listener to cap Spark-plan bandwidth.

### Implemented
- `src/services/ChatRTDB.ts` — RTDB SDK wrapper (init, sendMessage,
  subscribeMessages, sendReaction, subscribeReactions). US-region URL
  `https://cricapp-2092-default-rtdb.firebaseio.com`.
- `src/components/LiveShoutbox.tsx` — glass-style chat popup, profile setup
  modal, 7 cricket pill phrases, latest-4 message rendering with fade ramp,
  reaction popup (29 emojis + 3 Lottie specials), full-screen overlay.
- `assets/lottie/{tomato,egg,flower}.json` — hand-crafted minimal Lottie
  JSONs for the 3 premium reactions.
- Wired into `app/match/[id].tsx` (single line at end of SafeAreaView).
- Version bump → `app.json` 1.0.17 (versionCode 17), `build.gradle` 17/1.0.17,
  workflow release tag `v1.0.17`.

### User personas
- Casual cricket fan watching a live match — taps a phrase to react instantly.
- Power user — taps another user's message to throw a tomato/egg/flower with
  Lottie splash visible to everyone in the room.

## Backlog
- P1 — User self-mute / report-abuse (basic anti-spam).
- P1 — Auto-rotate pill phrases based on match context (e.g. add "Run-out"
  after a wicket-fall ball).
- P2 — Cricket-themed Lottie pack (cricket bat, ball, trophy).
- P2 — Pro users get exclusive Lottie throws (revenue lever).

## Next Action Items
- User: Enable Firebase Realtime Database in console once (steps in chat).
- User: Click Save-to-GitHub → CI auto-builds v1.0.17 APK + AAB.
