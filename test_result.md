# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "CricApp v1.0.8 - Live cricket scoring React Native app. Implementing: (1) Search Bar Deep Linking for quick match access, (2) Persistent Commentary Database using AsyncStorage with Sync-on-Open logic, (3) Squad Player Photos and Roles display"

backend:
  - task: "N/A - Pure React Native frontend app"
    implemented: false
    working: "NA"
    file: "N/A"
    stuck_count: 0
    priority: "NA"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "This is a React Native frontend app without backend"

frontend:
  - task: "Search Bar Deep Linking"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Phase 1 Complete: Updated applyLeagueFilter() to prioritize search over league filter. When user types in search bar, it searches ALL matches across all leagues. Added auto-dismiss search bar when navigating to match. Search now works globally across Live/Recent/Upcoming tabs."

  - task: "Commentary Database AsyncStorage Implementation"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/services/CommentaryDB.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Phase 2 Complete: Added detectCommentaryGap() function for Sync-on-Open logic. Cleanup interval reduced from 7 days to 3 days to prevent app bloat. Settings page now has 'Clear Cache & Commentary' button that calls cleanupOldCommentary(). Ball-by-ball data stored per match with innings tracking."

  - task: "Settings Clear Cache Integration"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/settings.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Integrated cleanupOldCommentary() into settings Clear Cache button. Updated UI text to reflect commentary clearing. Auto-cleanup happens every 3 days."

  - task: "Squad Player Photos and Roles"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/SquadsSection.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Phase 3 Complete: Updated PlayerAvatar component to accept imageId/imageUrl props. Using Cricbuzz CDN pattern: https://img1.cricbuzz.com/img/face/player_{faceImageId}.jpg. Added faceImageId extraction from API data (checking faceImageId, imageId, image_id fields). Images shown for Playing XI, Substitutes, and Bench players. Fallback to icon placeholder if image fails to load."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Search Bar Deep Linking"
    - "Commentary Database AsyncStorage Implementation"
    - "Squad Player Photos and Roles"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "All 3 phases of v1.0.8 implementation complete. Phase 1: Search bar now searches globally across all tabs and auto-dismisses on navigation. Phase 2: Commentary DB with Sync-on-Open gap detection and 3-day auto-cleanup. Phase 3: Player photos using Cricbuzz CDN with proper fallback. Ready for comprehensive testing. Note: This is a React Native/Expo app - testing will require actual device/emulator or manual verification as browser-based testing is not applicable."


# ==================== v1.0.11 CHANGELOG ====================
# 3 user-reported fixes implemented (no testing agent run per user request):
#
# TASK 1 - Scoreboard cleanup
#   - Removed "THIS OVER" chip strip (unreliable recentOvsStr data)
#   - Status text now replaces full team names with shortName (e.g.
#     "Lucknow Super Giants need 88 runs" → "LSG need 88 runs"), saving
#     horizontal space at the top of the scoreboard.
#
# TASK 2 - Commentary correctness
#   - Removed keyword-based bold/uppercase/red highlighting of FOUR / SIX /
#     OUT / WICKET / BOWLED etc. in narrative prose. Previously commentators'
#     metaphorical use ("OUT so perfectly", "BOWLED into the WICKET") was
#     rendered as though a real dismissal had occurred.
#   - OUT / SIX / FOUR highlighting is now driven ONLY by the ball's actual
#     event type (Cricbuzz eventtype + runs fallback).
#   - Added structured-runs fallback to event detection in api.ts so a ball
#     worth 6/4 runs renders the SIX / FOUR badge even when eventtype is
#     blank (fixes reported SIX appearing as normal text).
#   - Removed duplicate "last ball" info box inside CricketField (it was
#     late-updating / appearing empty).
#   - Added safety: empty / whitespace-only commentary rows are filtered
#     out before rendering, and the red wicket event card only renders
#     once actual wicket text (>20 chars) has arrived — eliminates the
#     empty pink box the user circled.
#
# TASK 3 - AdMob Rewarded ad UX
#   - Verified rewarded Ad Unit: ca-app-pub-9675798593675825/6702704058 ✓
#   - Preload error backoff tightened from 3-10s to 1.5-4s so an ad is
#     almost always ready when user taps Unlock.
#   - Added AppState 'active' + 60s keep-alive hooks to re-arm the preload
#     whenever the rewarded ad is absent.
#   - showRewardedAd() no longer shows any "Ad Not Available" alert. On
#     preload miss it silently retries the on-demand load until an ad
#     arrives or a 45s global cap elapses. Button shows a loading spinner
#     throughout — user ALWAYS sees an ad once one loads.
#   - Fixed progress-bar inconsistency: Pro unlock progress was /2 in the
#     UI but handler needed 3 ads to unlock. Now consistently /3.
#
# Files touched:
#   frontend/app/match/[id].tsx
#   frontend/src/components/CommentarySection.tsx
#   frontend/src/components/CricketField.tsx
#   frontend/src/services/api.ts
#   frontend/src/context/AdMobContext.native.tsx
#
# Version bump: ready for 1.0.11 (app.json versionCode/version to be
# bumped by CI pipeline on "Save to GitHub" per user's standing workflow).

# ==================== v1.0.11 Part 2 — Native Ads + UX Tasks (2026-04-20) ====================
#
# TASK 1 — Native Advanced Ads migration (removed all banners)
#   • New component: src/components/NativeAdCard.tsx
#       - Dark #121212 premium card, rounded 14px, border 1px #2A2A2A
#       - Media aspect 16:9 via <NativeMediaView /> (video auto-plays
#         muted — Google SDK default + explicit startVideoMuted:true)
#       - "Ad" sponsorship badge (top-left) and advertiser name row
#         per AdMob policy
#       - Only the CTA button and AdChoices icon are pressable →
#         prevents accidental clicks / data hiding concerns
#       - Loading placeholder is 6px high so no empty dark boxes
#       - Destroys NativeAd instance on unmount to free native memory
#   • New service: src/services/NativeAdRotator.ts
#       - Strict round-robin across 3 unit IDs (user-provided via
#         screenshots):
#           /9123709995, /1049778852, /6409916742
#       - getNextNativeAdUnit() for mount-time rotation
#       - pickNativeAdUnit(index) for deterministic slot assignment
#         inside .map() loops (prevents ID flicker on re-render)
#   • Placements (AdMob policy: ≥1 full "block" of content between
#     any two ads on screen):
#       - Commentary tab: ONE top native below scoreboard+pitch
#         (slotIndex=0) + over-break ad at every over transition
#         starting from the 2nd over (slotIndex=1,2,3…). The very
#         first over transition is suppressed so it isn't adjacent
#         to the top ad.
#       - Empty-state / upcoming-match placeholder: ONE native only
#         (was 2 banners → flagged policy risk, now safe).
#       - Scorecard tab: ONE native at natural break between
#         Batting and Bowling sections (other 2 banner slots
#         removed to avoid adjacency).
#       - Squads tab: ONE native between Playing XI and Substitutes
#         (other 3 banner slots removed).
#   • All `<BannerAdComponent />` call sites in app/src now render
#     `<NativeAdCard />` directly. BannerAdComponent in AdMob context
#     is kept as a backward-compat wrapper that returns <NativeAdCard />
#     so any stale reference is harmless.
#   • Banner AdUnit ID remains in AD_IDS for bookkeeping but no view
#     renders a BannerAd any more.
#
# TASK 2 — Scoreboard dark-blue rounded border
#   • styles.scoreHeader now has: borderWidth 2, borderColor #0D47A1
#     (Material dark blue 900), borderRadius 10, overflow:hidden,
#     marginHorizontal 6, marginTop 4.
#   • Kept shadow/elevation intact so card still has depth.
#   • Existing 13/7 horizontal paddings are sufficient — no content
#     clipping after adding the 2-px frame.
#
# TASK 3 — White wallpaper as Standard default
#   • useWallpaper initial state and AsyncStorage fallback switched
#     from 'default' to 'white'.
#   • WALLPAPER_PRESETS.white.label changed from 'White' → 'Standard'.
#   • WallpaperPicker presetKeys reordered: ['white', 'default',
#     'black', 'lightgreen'] — white tile now appears first.
#
# TASK 4 — Settings: "Customise Wallpaper" moved above "Clear Cache"
#   • Reordered sections in app/settings.tsx so Appearance (Section 4)
#     is rendered before Storage & Performance (Section 5).
#
# Files added:
#   frontend/src/components/NativeAdCard.tsx
#   frontend/src/services/NativeAdRotator.ts
#
# Files modified:
#   frontend/app/match/[id].tsx
#   frontend/app/settings.tsx
#   frontend/src/components/CommentarySection.tsx
#   frontend/src/components/ScorecardSection.tsx
#   frontend/src/components/SquadsSection.tsx
#   frontend/src/components/WallpaperPicker.tsx
#   frontend/src/context/AdMobContext.native.tsx
#   frontend/src/hooks/useWallpaper.ts
#
# TypeScript: no new errors introduced (pre-existing SplashScreen + settings
# Switch typing errors remain unchanged).
# Build: no test agent run per user standing instruction. GitHub "Save to
# GitHub" action will build the APK/AAB.
# ============================================================

# ============================================================
