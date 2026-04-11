# CricApp - PRD & Progress Tracker

## ROOT CAUSE #1: Wrong Ad Unit ID (FIXED)
- Code had: `6702740458` (digits transposed)
- Correct: `6702704058` (matching AdMob console)

## ROOT CAUSE #2: Commentary Fallback False Positives (FIXED)
- `text.includes('wicket')` matched "mid-wicket" (field position)
- `text.includes('out')` matched "outside" (ball position)
- Fix: Precise regex patterns with word boundaries and exclusions

## ROOT CAUSE #3: Cricbuzz W = Wide, not Wicket (FIXED)
- Cricbuzz recentOvsStr uses W for WIDE delivery
- Evidence: CSK 212/2 had 6 W markers but only 2 wickets
- Fix: formatOverSummary converts W→Wd (orange wide display)

## All Changed Files
1. `AdMobContext.native.tsx` - Ad ID fix + singleton fix + UMP consent
2. `AdMobContext.tsx/web.tsx` - type sync
3. `match/[id].tsx` - formatOverSummary W=Wide fix
4. `api.ts` - Commentary fallback false positive fix
5. `app.json` + `build.gradle` - version 1.0.3
