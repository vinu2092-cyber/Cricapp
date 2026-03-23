# CrickApp - Cricket Score Tracking Mobile App

## Overview
CrickApp is an Expo React Native mobile application for tracking live, recent, and upcoming cricket matches. The app features a modern UI with cricket-themed design elements.

## Key Features

### 1. Match List Display
- **Live Matches Tab**: Shows ongoing cricket matches with live scores (AUTO-REFRESH every 10 seconds)
- **Recent Matches Tab**: Displays completed matches with results from API
- **Upcoming Matches Tab**: Shows scheduled future matches

### 2. Match Cards
- Team names and short codes
- Scores with runs/wickets format
- Overs played
- Match result or status
- Animated LIVE indicator for live matches
- Click to view match details

### 3. Match Details Screen
- Full series name and match type
- Venue with location icon
- Detailed scorecard with team badges
- Match result with trophy icon
- Match format information
- Auto-refresh for live matches (every 10 seconds)

### 4. Ball-by-Ball Commentary (NEW)
- Dual language support: **English** and **Hindi**
- Language toggle switch (EN/हि) to instantly swap languages
- Over and ball number display
- Event badges (WICKET, SIX, FOUR, DOT)
- Color-coded events for visual distinction

### 5. Pro Unlock Feature
- "UNLOCK PRO" button in header
- Mock ad watching flow (3 ads required)
- Progress tracking with numbered circles
- 5-second countdown per ad
- Pro status persisted using AsyncStorage

### 6. UI Design
- Cricket doodle wallpaper pattern background
- Green grass header and footer images
- CrickApp logo in header
- Green color scheme matching cricket theme
- Status badges (LIVE-red, RESULT-green, UPCOMING-blue)
- Auto-refresh indicator banner for live matches

## Data Sources
- **External API**: https://cric-app-old-archive-api-server.vercel.app/api/matches (Recent matches)
- **Mock Data**: Live and Upcoming matches are simulated for demonstration

## Auto-Refresh Feature
- Live matches auto-update scores every 10 seconds
- Visual indicator shows "Auto-refreshing every 10 seconds"
- Works on both home screen and match details page

## Tech Stack
- **Frontend**: Expo React Native with TypeScript
- **Navigation**: expo-router (file-based routing)
- **State Management**: React Context (ProContext)
- **HTTP Client**: Axios
- **Storage**: AsyncStorage for Pro status persistence
- **Icons**: @expo/vector-icons (Ionicons)
- **Animations**: React Native Animated API

## File Structure
```
/app/frontend/
├── app/
│   ├── _layout.tsx (Root layout with ProProvider)
│   ├── index.tsx (Home screen with match list + auto-refresh)
│   └── match/
│       └── [id].tsx (Match detail with commentary)
├── src/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── TabBar.tsx
│   │   ├── MatchCard.tsx
│   │   ├── AdModal.tsx
│   │   ├── ErrorScreen.tsx
│   │   ├── LoadingScreen.tsx
│   │   ├── CommentarySection.tsx (NEW - Dual language commentary)
│   │   └── LiveIndicator.tsx (NEW - Animated LIVE badge)
│   ├── context/
│   │   └── ProContext.tsx
│   ├── services/
│   │   └── api.ts (API + mock data + live score simulation)
│   └── types/
│       └── match.ts (includes Commentary type)
└── assets/images/
    ├── logo.png
    ├── wallpaper.png
    └── header-grass.png
```

## Assets Used
- **logo.png**: CrickApp logo with cricket ball, bat, and stumps
- **wallpaper.png**: Cricket doodle pattern (bats, stumps, balls, gloves)
- **header-grass.png**: Green cricket field grass texture
