# CricApp - PRD

## What's Been Implemented

### Session 3: Scorecard Fix + Banner Ad + Push Notifications

**Task 1: Scorecard "batting" bug fix**
- Added `didBat()` function to correctly identify players who actually batted vs DNB
- Separates batsmen into `battedPlayers` (batted) and `yetToBat` (didn't bat)
- Shows "Yet to Bat" for live matches, "Did Not Bat" for completed matches
- Players who didn't bat shown as comma-separated names (not in batting table with 0s)
- Handles all edge cases: not out, retired hurt, 0(0) with valid dismissal

**Task 2: Banner Ad sizing fix**
- Changed container from `width: '100%'` with `minHeight: 60` to exact `Dimensions.get('window').width`
- Removed extra `marginVertical: 10` (was 10, now 4)
- Added `overflow: 'hidden'` to prevent content bleeding
- Kept `ANCHORED_ADAPTIVE_BANNER` size (correct choice)
- Ad Unit ID untouched

**Task 3: Push Notifications + Deep Linking**
- Added `LEAGUE_KEYWORDS` to auto-track (BBL, PSL, CPL, SA20, Hundred, BPL, ILT20, MLC, County, etc.)
- Created `match-reminders` notification channel with MAX importance, distinct vibration
- Updated `scheduleMatchReminder` with formatted time/date and match-reminders channel
- Added `NotificationDeepLinkHandler` component in _layout.tsx
- Handles notification tap → navigates to `/match/{matchId}` via expo-router
- Handles cold start (app launched from notification)
- Cleaned NOT_SUBSCRIBED keys from NotificationContext.tsx
- Removed non-existent secondary provider from server.py

### Files Modified
- `frontend/src/components/ScorecardSection.tsx` - DNB fix
- `frontend/src/context/AdMobContext.native.tsx` - Banner sizing
- `frontend/src/context/NotificationContext.tsx` - Keys + League auto-track
- `frontend/src/services/NotificationService.ts` - Reminder channel + content
- `frontend/app/_layout.tsx` - Deep linking handler
- `backend/server.py` - Key cleanup + removed dead provider

## Backlog
- P1: Add more RapidAPI subscribed keys for reliability
- P2: Add custom notification sound file (currently uses 'default')
- P2: Add Scorecard "Yet to Bat" list real-time updates during live innings
- P3: Server-side scheduled notifications via Firebase Cloud Messaging
