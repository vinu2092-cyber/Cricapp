# 📋 CricApp - Complete API & Play Store Guide

---

# PART 1: API INFORMATION

## 🔑 API jo App mein Use Hui Hai:

### 1. Cricbuzz Cricket API (RapidAPI)

| Detail | Information |
|--------|-------------|
| **API Provider** | RapidAPI |
| **API Name** | Cricbuzz Cricket |
| **API URL** | https://rapidapi.com/cricketapilive/api/cricbuzz-cricket |
| **Host** | `cricbuzz-cricket.p.rapidapi.com` |
| **Free Tier** | 100 requests/month per key |
| **Paid Plans** | $10/month = 10,000 requests |

### 2. Google AdMob (Ads ke liye)

| Detail | Information |
|--------|-------------|
| **Provider** | Google AdMob |
| **Console** | https://admob.google.com |
| **Cost** | FREE (Google pays YOU) |
| **App ID** | `ca-app-pub-9675798593675825~2399929714` |

---

## 📊 Current API Keys in App:

### File Location:
```
frontend/src/services/api.ts
```

### Lines 11-43 mein 19 API Keys hain:

**Commentary Keys (Line 11-17):**
```javascript
const COMM_KEYS = [
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  "6a948b174dmsh4e7c9f6c75d3531p10b8e4jsna91b6b6ba925",
  "be681ef5f4mshf8eb5972bbbe7abp1d55d8jsn54464cbad4d4",
  "efa0ba9303mshae4ea9f45a69057p1fde83jsn4ec1c45ca5e5",
];
```

**Match Keys (Line 20-43) - 19 Keys:**
```javascript
const MATCH_KEYS = [
  "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
  "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
  ... (17 more keys)
];
```

---

## 💰 API Recharge Kaise Karein:

### Step 1: RapidAPI Account
1. https://rapidapi.com/ pe jaao
2. Login karo (ya sign up)

### Step 2: Cricbuzz API page
1. Search karo "Cricbuzz Cricket"
2. Ya direct link: https://rapidapi.com/cricketapilive/api/cricbuzz-cricket

### Step 3: Subscribe to Plan
1. **"Pricing"** tab pe click karo
2. Plans:
   - **Basic (FREE):** 100 requests/month
   - **Pro ($10/month):** 10,000 requests/month
   - **Ultra ($25/month):** 50,000 requests/month
   - **Mega ($50/month):** 150,000 requests/month

### Step 4: Get Your API Key
1. Subscribe karne ke baad
2. **"Endpoints"** tab pe jaao
3. Right side mein **"X-RapidAPI-Key"** dikhega
4. **Copy** karo

### Step 5: App mein Add karo
1. `frontend/src/services/api.ts` file edit karo
2. `MATCH_KEYS` array mein apni key add karo

---

## 📈 API Usage Estimate (20 Testers ke liye):

| Action | API Calls per User/Day | 20 Users/Day | 14 Days |
|--------|------------------------|--------------|---------|
| App Open (match list) | 5 | 100 | 1,400 |
| Match Detail View | 10 | 200 | 2,800 |
| Auto Refresh | 20 | 400 | 5,600 |
| **TOTAL** | 35 | 700 | **9,800** |

### Recommendation:
- Tumhare paas **19 keys × 100 = 1,900 free calls/month** hain
- 20 testers ke liye **~10,000 calls** chahiye 14 din mein
- **Solution:** 1-2 Pro plan ($10 each) subscribe karo ya 10 more free accounts banao

---

# PART 2: PLAY STORE DESCRIPTIONS (SEO Optimized, Ban-Safe)

## 📱 App Name (30 characters max):
```
CricApp - Live Cricket Scores
```

## 📝 Short Description (80 characters max):
```
Live cricket scores, ball-by-ball commentary & floating scoreboard widget free
```

## 📄 Full Description (4000 characters max):

```
CricApp brings you lightning-fast live cricket scores right to your fingertips! Never miss a single ball with our real-time updates and unique floating scoreboard feature.

★★★ WHY CRICKET FANS LOVE CRICAPP ★★★

🏏 LIVE SCORES - REAL TIME
• Instant score updates for all cricket matches worldwide
• International matches: Tests, ODIs, T20Is
• Major leagues: IPL, BBL, PSL, CPL, The Hundred
• Domestic cricket: Ranji Trophy, County Championship
• Women's cricket coverage

📊 DETAILED SCORECARDS
• Full batting and bowling statistics
• Partnership details
• Fall of wickets
• Run rate and required run rate
• Match summary and result

💬 BALL-BY-BALL COMMENTARY
• Live text commentary in English
• Every delivery covered
• Key moments highlighted
• Wicket alerts and boundary notifications

🎯 FLOATING SCOREBOARD - UNIQUE FEATURE!
• Watch live scores OVER other apps
• Perfect for watching scores while using WhatsApp or YouTube
• Draggable widget - place anywhere on screen
• Minimize or expand as needed
• Works in background

🔔 SMART NOTIFICATIONS
• Wicket alerts
• Boundary notifications (4s and 6s)
• Match start reminders
• Innings break updates
• Match result notifications

📱 MATCHES WE COVER:
• ICC Cricket World Cup
• ICC T20 World Cup
• Indian Premier League (IPL)
• Big Bash League (BBL)
• Pakistan Super League (PSL)
• Caribbean Premier League (CPL)
• The Hundred
• SA20
• International Test Matches
• ODI Series
• T20I Series
• County Championship
• Ranji Trophy
• Sheffield Shield
• And many more!

🎁 PRO FEATURES (Unlock Free!)
• Watch 3 short video ads = 30 minutes Pro access
• Voice commentary feature
• Ad-free experience during Pro mode
• Enhanced floating scoreboard

✨ APP FEATURES:
✓ 100% Free to download and use
✓ No registration or login required
✓ Works on slow internet connections
✓ Lightweight app - less than 35MB
✓ Battery efficient
✓ Clean and simple interface
✓ Dark theme for comfortable viewing
✓ Quick loading times

🌟 PERFECT FOR:
• Cricket enthusiasts
• Fantasy cricket players
• Sports fans who multitask
• Anyone who wants quick score updates

📱 DEVICE SUPPORT:
• Android 7.0 and above
• Optimized for all screen sizes
• Works on phones and tablets

Note: This app provides cricket scores using publicly available data for informational and entertainment purposes. We are not affiliated with any cricket board or organization.

Download CricApp now and never miss a cricket moment! 🏆

Questions or feedback? We'd love to hear from you!
```

---

## 🏷️ Keywords/Tags for Better Search Ranking:

### Category to Select:
```
Sports
```

### Tags (if Play Console asks):
```
cricket, live score, cricket score, ipl, t20, odi, test match, cricket app, live cricket, ball by ball, scorecard, cricket news, ipl live, world cup cricket, cricket widget, floating score, cricket commentary
```

---

## 🖼️ Screenshots ke liye Captions:

### Screenshot 1 (Home Screen):
```
All Live Matches at a Glance
```

### Screenshot 2 (Match Detail):
```
Detailed Live Scorecard
```

### Screenshot 3 (Floating Widget):
```
Watch Scores Over Any App!
```

### Screenshot 4 (Commentary):
```
Ball-by-Ball Live Commentary
```

### Screenshot 5 (Notifications):
```
Never Miss a Wicket!
```

---

## 📋 Feature Graphic Text (for Canva):

**Main Text:**
```
CricApp
Live Cricket Scores
```

**Tagline:**
```
Floating Scoreboard • Ball-by-Ball • Free
```

---

# PART 3: CONTENT RATING ANSWERS

## When filling Content Rating Questionnaire:

| Question | Answer |
|----------|--------|
| Violence | No |
| Fear | No |
| Sexuality | No |
| Nudity | No |
| Language | No (no bad words) |
| Controlled Substances | No |
| Gambling | No |
| User Interaction | No (no chat feature) |
| Location Sharing | No |
| Personal Information | No |

**Result Rating:** Everyone (E) or PEGI 3

---

# PART 4: DATA SAFETY FORM ANSWERS

## Privacy Practices:

| Question | Answer | Reason |
|----------|--------|--------|
| Does app collect data? | Yes | Device ID for ads |
| Data types collected | Device IDs, App interactions | AdMob needs this |
| Is data encrypted? | Yes | HTTPS used |
| Can users request deletion? | Yes | They can clear app data |
| Data shared with third parties? | Yes | Google AdMob |

## Data Types to Select:

### ✅ Select These:
- Device or other IDs (for advertising)
- App interactions (how user uses app)

### ❌ Don't Select (we don't collect):
- Name
- Email
- Phone number
- Location
- Photos
- Files
- Payment info

---

# PART 5: BAN PREVENTION CHECKLIST

## ❌ App Ban Hone ke Reasons (AVOID THESE):

| Reason | Kya galat kiya | Kaise bachein |
|--------|---------------|---------------|
| Copyright | BCCI/IPL logos use kiye | Generic cricket images use karo |
| Fake Testers | Fake Gmail accounts | Real dost/family |
| Misleading | Description mein jhooth | Sirf real features likho |
| Spam | Same app multiple times | Ek hi app rakho |
| Malware | Harmful code | Clean code rakho |
| Policy Violation | Rules todna | Guidelines follow karo |
| Fake Reviews | Paid reviews | Organic reviews lo |

## ✅ Safe Practices:

1. **Description mein sirf wahi likho jo app mein hai**
2. **Screenshots real app ke hon**
3. **No copyrighted logos** (IPL, BCCI, team logos)
4. **Privacy Policy link working ho**
5. **Ads declaration sahi ho**
6. **Content rating sahi ho**
7. **Real testers use karo**

---

# PART 6: QUICK REFERENCE

## Files to Remember:

| Purpose | File Path | Line Numbers |
|---------|-----------|--------------|
| API Keys | `frontend/src/services/api.ts` | 11-43 |
| Ad Unit IDs | `frontend/src/context/AdMobContext.native.tsx` | 17-21 |
| App Version | `frontend/app.json` | 5 |
| Package Name | `frontend/app.json` | 47 |
| App Name | `frontend/app.json` | 3 |

## Important Links:

| Service | URL |
|---------|-----|
| Play Console | https://play.google.com/console |
| AdMob Console | https://admob.google.com |
| RapidAPI (Cricket) | https://rapidapi.com/cricketapilive/api/cricbuzz-cricket |
| Canva (Graphics) | https://canva.com |

---

**Document Created:** April 2026
**App:** CricApp - Live Cricket Scores
**Package:** com.cricapp.live
