# CricApp - PRD v1.0.5

## App Version: 1.0.5 (versionCode: 5)

## All Implementations

### Session 1-2: Firebase + Fallback + Provider Factory
- Firebase fetches api_key, api_host, current_provider from Firestore
- Provider Factory Pattern for 3 providers (cricbuzz-cricket, free-cricbuzz-cricket, cricket-live-data)
- Fallback: Firebase (5s) -> User key -> Random rotation of cleaned keys on HOST_1
- Firebase key double-try (HOST_2 -> HOST_1 fallback)
- API keys cleaned: removed NOT_SUBSCRIBED, kept QUOTA_EXCEEDED

### Session 3: Scorecard + Banner Ad + Push Notifications
- Scorecard batting/DNB fix with "Yet to Bat" / "Did Not Bat" section
- Banner Ad sizing fix (exact screen width, no padding)
- Push notifications for International + League matches with deep linking
- Match reminder channel with MAX importance

### Session 4: FCM + Inbox (Current)
**Task 1: FCM & Admin Broadcast**
- Firebase Admin SDK initialized with service account JSON on backend
- POST /api/fcm/subscribe - subscribes device token to 'all_users' topic
- POST /api/fcm/broadcast - sends admin broadcast to all subscribers
- Frontend auto-subscribes to 'all_users' topic on first app launch
- Deep linking: admin broadcast notifications -> Inbox page

**Task 2: Inbox Page**
- Header icon: chatbubble-ellipses-outline with dynamic red badge (unread count)
- InboxContext: manages messages, unread count, read/unread status, AsyncStorage persistence
- Inbox page: commentary-style design (transparent bg, rounded cards)
- Each message: title, relative timestamp, body text
- Auto marks all as read when inbox opened
- Max 100 messages stored

### Files Modified/Created
- backend/server.py - FCM endpoints + key cleanup
- backend/firebase-service-account.json - NEW: service account
- backend/requirements.txt - Added firebase-admin
- frontend/app.json - Version 1.0.5, versionCode 5
- frontend/app/_layout.tsx - InboxProvider + deep link routing
- frontend/app/inbox.tsx - NEW: Inbox page
- frontend/src/components/Header.tsx - Inbox icon + badge
- frontend/src/context/InboxContext.tsx - NEW: Inbox state management
- frontend/src/components/ScorecardSection.tsx - DNB fix
- frontend/src/context/AdMobContext.native.tsx - Banner sizing
- frontend/src/context/NotificationContext.tsx - Keys + League auto-track
- frontend/src/services/NotificationService.ts - Reminder channel
- frontend/src/services/api.ts - Key cleanup + scorecard endpoint
- frontend/src/services/FirebaseKeyService.ts - Provider support
- frontend/app/match/[id].tsx - Scorecard tab

## Backlog
- P2: Custom notification sound file
- P3: Firebase Cloud Functions for server-side scheduled notifications
