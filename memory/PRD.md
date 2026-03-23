# CrickApp - Cricket Score Tracking Mobile App

## Overview
CrickApp is an Expo React Native mobile application for tracking live, recent, and upcoming cricket matches. The app features a modern UI with cricket-themed design elements.

## Key Features

### 1. Match List Display
- **Live Matches Tab**: Shows ongoing cricket matches with live scores
- **Recent Matches Tab**: Displays completed matches with results
- **Upcoming Matches Tab**: Shows scheduled future matches

### 2. Match Cards
- Team names and short codes
- Scores with runs/wickets format
- Overs played
- Match result or status
- Click to view match details

### 3. Match Details Screen
- Full series name and match type
- Venue with location icon
- Detailed scorecard with team badges
- Match result with trophy icon
- Match format information

### 4. Pro Unlock Feature
- "UNLOCK PRO" button in header
- Mock ad watching flow (3 ads required)
- Progress tracking with numbered circles
- 5-second countdown per ad
- Pro status persisted using AsyncStorage

### 5. UI Design
- Cricket doodle wallpaper pattern background
- Green grass header and footer images
- CrickApp logo in header
- Green color scheme matching cricket theme
- Status badges (LIVE-red, RESULT-green, UPCOMING-blue)

## API Integration
- External API: https://cric-app-old-archive-api-server.vercel.app/api/matches
- Returns match data with status, teams, scores, and results

## Tech Stack
- **Frontend**: Expo React Native with TypeScript
- **Navigation**: expo-router (file-based routing)
- **State Management**: React Context (ProContext)
- **HTTP Client**: Axios
- **Storage**: AsyncStorage for Pro status persistence
- **Icons**: @expo/vector-icons (Ionicons)

## File Structure
```
/app/frontend/
├── app/
│   ├── _layout.tsx (Root layout with ProProvider)
│   ├── index.tsx (Home screen with match list)
│   └── match/
│       └── [id].tsx (Match detail screen)
├── src/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── TabBar.tsx
│   │   ├── MatchCard.tsx
│   │   ├── AdModal.tsx
│   │   ├── ErrorScreen.tsx
│   │   └── LoadingScreen.tsx
│   ├── context/
│   │   └── ProContext.tsx
│   ├── services/
│   │   └── api.ts
│   └── types/
│       └── match.ts
└── assets/images/
    ├── logo.png
    ├── wallpaper.png
    └── header-grass.png
```

## Assets Used
- **logo.png**: CrickApp logo with cricket ball, bat, and stumps
- **wallpaper.png**: Cricket doodle pattern (bats, stumps, balls, gloves)
- **header-grass.png**: Green cricket field grass texture
