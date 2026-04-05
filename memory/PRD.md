# CricApp - PRD & Task Tracker

## Original Problem Statement
Clone CricApp repo, append API keys, fix UI bugs, add IPL/International match notifications.

## Architecture
- **Platform**: React Native / Expo
- **Build**: EAS Build (APK + AAB)
- **API Provider**: Cricbuzz Cricket (RapidAPI)

## What's Been Implemented (Jan 2026)

### API Key Status Check ✅
- **6 Active Keys** (working):
  - `6a948b174d...` (Key 13)
  - `be681ef5f4...` (Key 15)
  - `efa0ba9303...` (Key 16)
  - `49895f57cb...` (Key 17)
  - `3b5c50ff5f...` (Key 18)
  - `948dd6c539...` (Key 19)
- **13 Inactive Keys** (rate limited/expired) - removed from rotation

### Badge Bug Fix ✅
- Abandoned matches now show "ABANDONED" (orange) instead of "UPCOMING"
- Check order: abandon/no result → completed → live → upcoming → delayed

### Auto Notification System ✅ (NEW)
**Files Modified:**
- `/frontend/src/services/NotificationService.ts` - Added `scheduleMatchReminder()`
- `/frontend/src/context/NotificationContext.tsx` - Complete rewrite with:
  - Auto-tracking IPL & International matches
  - Match start reminder (10 min before)
  - Wicket, Four, Six, Milestone detection from commentary
  - Better event detection using keyword matching
- `/frontend/app/settings.tsx` - Added notification toggle UI

**Features:**
1. **Auto-Track**: Automatically tracks all IPL and International matches
2. **Match Reminder**: 10 minutes before match starts
3. **Event Alerts**:
   - 🔴 WICKET alerts
   - 4️⃣ FOUR alerts  
   - 6️⃣ SIX alerts
   - 🎯 Milestone alerts (50s, 100s)
4. **Settings UI**: Toggle auto-track and notifications

**IPL/International Detection Keywords:**
- IPL: 'ipl', 'indian premier league', 'tata ipl'
- International: 'test', 'odi', 't20i', 'world cup', 'asia cup', 'icc'

## Files Modified
1. `/frontend/src/services/api.ts` - Updated to only active keys (6 keys)
2. `/frontend/src/services/NotificationService.ts` - Added match reminder
3. `/frontend/src/context/NotificationContext.tsx` - Auto-track + event detection
4. `/frontend/src/components/LiveIndicator.tsx` - Badge fix
5. `/frontend/app/settings.tsx` - Notification settings UI

## Pending
- User to trigger EAS build
- Push code via "Save to Github"

## Backlog
- Background task for notifications when app is killed
- Push notifications via server (FCM) for better reliability
