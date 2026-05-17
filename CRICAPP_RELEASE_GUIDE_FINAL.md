# 🎯 CricApp - EXACT Production Release Guide
# 14 दिन Testing के बाद Play Store Release के लिए Step-by-Step Guide

---

## 📍 PART 1: VERSION NUMBER कैसे बदलें

### File: `frontend/app.json`
### Line Number: 5

**अभी लिखा है:**
```
"version": "1.0.1",
```

**बदलना है:**
```
"version": "1.0.2",
```

**नियम:**
- पहली बार release: `1.0.0`
- छोटा fix: `1.0.1` → `1.0.2` → `1.0.3`
- नया feature: `1.0.1` → `1.1.0`
- बड़ा update: `1.0.1` → `2.0.0`

---

## 📍 PART 2: PACKAGE NAME

### File: `frontend/app.json`
### Line Number: 47

**अभी लिखा है:**
```
"package": "com.cricapp.live",
```

**यह नहीं बदलना है!** 
- अगर बदलोगे तो Play Store पर नई app बनेगी
- पुरानी app update नहीं होगी
- इसे वैसे ही रहने दो: `com.cricapp.live`

---

## 📍 PART 3: AdMob Ad Unit IDs (सबसे IMPORTANT)

### File: `frontend/src/context/AdMobContext.native.tsx`
### Line Numbers: 17, 18, 19, 20, 21

---

### 🔹 LINE 17 - APP OPENING AD

**अभी लिखा है:**
```
appOpen: 'ca-app-pub-3940256099942544/9257395921',
```

**बदलना है (अपनी ID डालो):**
```
appOpen: 'ca-app-pub-9675798593675825/4826782503',
```

**यह ID कहां से मिलेगी:**
1. https://admob.google.com/ खोलो
2. Left menu में "Apps" → अपनी app select करो
3. "Ad units" पर click करो
4. "App open" वाली ad unit की ID copy करो

---

### 🔹 LINE 18 - INTERSTITIAL AD (Full Screen Ad)

**अभी लिखा है:**
```
interstitial: 'ca-app-pub-3940256099942544/1033173712',
```

**बदलना है (अपनी ID डालो):**
```
interstitial: 'ca-app-pub-9675798593675825/8438724452',
```

**यह ID कहां से मिलेगी:**
1. AdMob Console → Apps → अपनी app
2. Ad units → "Interstitial" वाली ad unit की ID copy करो

---

### 🔹 LINE 19 - BANNER AD (छोटी Ad नीचे)

**अभी लिखा है:**
```
banner: 'ca-app-pub-3940256099942544/6300978111',
```

**बदलना है (अपनी ID डालो):**
```
banner: 'ca-app-pub-9675798593675825/8616886104',
```

**यह ID कहां से मिलेगी:**
1. AdMob Console → Apps → अपनी app
2. Ad units → "Banner" वाली ad unit की ID copy करो

---

### 🔹 LINE 20 - REWARDED AD (Video देखो, Pro पाओ)

**अभी लिखा है:**
```
rewarded: 'ca-app-pub-3940256099942544/5224354917',
```

**बदलना है (अपनी ID डालो):**
```
rewarded: 'ca-app-pub-9675798593675825/6702740458',
```

**यह ID कहां से मिलेगी:**
1. AdMob Console → Apps → अपनी app
2. Ad units → "Rewarded" वाली ad unit की ID copy करो

---

### 🔹 LINE 21 - NATIVE AD (अगर use करें)

**अभी लिखा है:**
```
native: 'ca-app-pub-3940256099942544/2247696110',
```

**बदलना है (अपनी ID डालो):**
```
native: 'ca-app-pub-9675798593675825/XXXXXXXXXX',
```

---

## 📍 PART 4: AdMob APP ID (3 जगह बदलना है)

### File: `frontend/app.json`

---

### 🔸 LOCATION 1 - Line 17

**अभी लिखा है:**
```
"appId": "ca-app-pub-9675798593675825~2399929714",
```

**यह तुम्हारी production ID है - इसे वैसे ही रहने दो**

---

### 🔸 LOCATION 2 - Line 29

**अभी लिखा है:**
```
"android_app_id": "ca-app-pub-9675798593675825~2399929714",
```

**यह तुम्हारी production ID है - इसे वैसे ही रहने दो**

---

### 🔸 LOCATION 3 - Line 72

**अभी लिखा है:**
```
"androidAppId": "ca-app-pub-9675798593675825~2399929714",
```

**यह तुम्हारी production ID है - इसे वैसे ही रहने दो**

---

## 📍 PART 5: COMPLETE CHANGE SUMMARY

### File 1: `frontend/src/context/AdMobContext.native.tsx`

**Lines 16-22 को इससे बदलो:**

```typescript
const AD_IDS = {
  appOpen: 'ca-app-pub-9675798593675825/4826782503',
  interstitial: 'ca-app-pub-9675798593675825/8438724452',
  banner: 'ca-app-pub-9675798593675825/8616886104',
  rewarded: 'ca-app-pub-9675798593675825/6702740458',
  native: 'ca-app-pub-3940256099942544/2247696110',
};
```

### File 2: `frontend/app.json`

**Line 5 में version बढ़ाओ:**
```
"version": "1.0.2",
```

---

## 📍 PART 6: GitHub पर कैसे Edit करें

### Step 1: GitHub खोलो
1. https://github.com/gemmiapps-rgb/CricApp पर जाओ
2. Login करो

### Step 2: AdMob IDs बदलो
1. `frontend` folder पर click करो
2. `src` folder पर click करो
3. `context` folder पर click करो
4. `AdMobContext.native.tsx` file पर click करो
5. ऊपर "Edit" (pencil icon) पर click करो
6. Line 17-21 में Test IDs हटाओ, Production IDs डालो
7. नीचे "Commit changes" पर click करो

### Step 3: Version बदलो
1. वापस जाओ `frontend` folder में
2. `app.json` file पर click करो
3. "Edit" पर click करो
4. Line 5 में version बढ़ाओ: `"version": "1.0.2",`
5. "Commit changes" पर click करो

### Step 4: Build करो
1. "Actions" tab पर click करो
2. Build automatically start होगी
3. ~15-20 minutes wait करो
4. "Artifacts" से AAB download करो

### Step 5: Play Store पर Upload करो
1. https://play.google.com/console खोलो
2. अपनी app select करो
3. "Production" → "Create new release"
4. AAB file upload करो
5. Release notes लिखो
6. "Review" पर click करो

---

## 📍 PART 7: AdMob Console में Ad Units कैसे बनाएं

### Step 1: AdMob Console खोलो
1. https://admob.google.com/ पर जाओ
2. Google account से login करो

### Step 2: App Add करो (अगर पहले नहीं किया)
1. Left menu में "Apps" पर click करो
2. "Add app" पर click करो
3. "Android" select करो
4. "No" select करो (अगर Play Store पर नहीं है)
5. App name डालो: `CricApp`
6. "Add" पर click करो

### Step 3: Ad Units बनाओ

#### App Open Ad:
1. "Ad units" पर click करो
2. "Add ad unit" पर click करो
3. "App open" select करो
4. Name डालो: `CricApp App Open`
5. "Create ad unit" पर click करो
6. **ID copy करो** (जैसे: `ca-app-pub-XXXX/YYYY`)

#### Interstitial Ad:
1. "Add ad unit" पर click करो
2. "Interstitial" select करो
3. Name डालो: `CricApp Interstitial`
4. "Create ad unit" पर click करो
5. **ID copy करो**

#### Banner Ad:
1. "Add ad unit" पर click करो
2. "Banner" select करो
3. Name डालो: `CricApp Banner`
4. "Create ad unit" पर click करो
5. **ID copy करो**

#### Rewarded Ad:
1. "Add ad unit" पर click करो
2. "Rewarded" select करो
3. Name डालो: `CricApp Rewarded`
4. Reward settings: Amount=1, Type=Coins
5. "Create ad unit" पर click करो
6. **ID copy करो**

---

## 📍 PART 8: Quick Reference Table

| क्या | File | Line | अभी क्या है | क्या डालना है |
|-----|------|------|------------|--------------|
| Version | app.json | 5 | `"1.0.1"` | `"1.0.2"` (या जो भी next) |
| App Open AD | AdMobContext.native.tsx | 17 | `ca-app-pub-3940256099942544/9257395921` | अपनी ID |
| Interstitial AD | AdMobContext.native.tsx | 18 | `ca-app-pub-3940256099942544/1033173712` | अपनी ID |
| Banner AD | AdMobContext.native.tsx | 19 | `ca-app-pub-3940256099942544/6300978111` | अपनी ID |
| Rewarded AD | AdMobContext.native.tsx | 20 | `ca-app-pub-3940256099942544/5224354917` | अपनी ID |

---

## ⚠️ IMPORTANT NOTES

1. **Test IDs हटाने से पहले** AdMob Console में Ad Units बना लो
2. **App ID (Line 17, 29, 72)** पहले से सही है - मत बदलो
3. **Package Name** मत बदलो - `com.cricapp.live` रहने दो
4. **Version हर बार बढ़ाओ** - 1.0.1 → 1.0.2 → 1.0.3
5. **Build के बाद** test करो कि ads आ रही हैं

---

## ✅ FINAL CHECKLIST

- [ ] AdMob Console में 4 Ad Units बनाए (App Open, Interstitial, Banner, Rewarded)
- [ ] `AdMobContext.native.tsx` में Line 17-20 में Test IDs → Production IDs
- [ ] `app.json` Line 5 में version बढ़ाया
- [ ] GitHub पर commit किया
- [ ] Build download किया
- [ ] Play Store पर upload किया

---

**Document Created:** April 2026
**App:** CricApp - Live Cricket Scores
**Package:** com.cricapp.live
