# CricApp PRD — v1.0.16 Rev 5 (2026-05-06)

## Recent Changes (this session)

### 1. Voice Commentary Picker — collapsed to 2 options
- **Before**: Hindi / English / Excited (3 options)
- **After**: Hindi Excited / English Excited (2 options)
- Both modes now use the "excited" rate (1.15) + pitch (1.05) profile
- Difference is the speech locale only: `hi-IN` vs `en-IN`
- Default: `english_excited`. Hindi Excited disabled if no Devanagari text
- Files: `src/services/VoicePrefs.ts`, `src/components/CommentarySection.tsx`, `app/match/[id].tsx`

### 2. League Filter — multi-select with "All" toggle
- New `All` chip added at start of horizontal scroll (default ON)
- "All" toggles on/off — pressing it when ON deselects everything; pressing again selects everything
- All other chips (IPL, International, BBL, Women, etc.) are independently togglable; selecting any clears the All chip
- List shows the **union** of matches across selected categories
- Always **time-sorted ascending** (earliest start first), powered by new `startTimestamp` field on `Match`
- Files: `app/index.tsx`, `src/services/api.ts`, `src/types/match.ts`

### 3. Match-start Notification Reliability Fix
- **Before**: 10-min reminder, only IPL/International auto-tracked, only when app is open → unreliable
- **After**:
  - Reminder fires **30 min before start** (per user directive)
  - Body now includes **venue + city + start time** + series name
  - New `preScheduleAllUpcomingReminders()` schedules local OS-level reminders for **every** upcoming match in the next 7 days, every time the upcoming tab is fetched
  - These reminders fire reliably even when app is killed because Android's `AlarmManager` owns the schedule once registered
  - Auto-track flow also forwards venue/city to the reminder
- Files: `src/services/NotificationService.ts`, `src/context/NotificationContext.tsx`, `app/index.tsx`

## Constraints respected
- No EAS builds, no web preview, no test runs locally
- `app.json` version stays `1.0.16` / `versionCode 16`
- `metro.config.js`, `frontend/.env`, `backend/.env` untouched
- AdMob unit IDs unchanged
- `.github/workflows/build-android.yml` untouched — push to `main` triggers APK + AAB build
