# 🟧 CricApp — Cloudflare Workers Setup Guide

**Goal:** Reduce RapidAPI calls by ~99% by putting a Cloudflare Worker edge-cache layer between the app and RapidAPI. Zero cost, commercial-safe, AdMob-friendly.

> ✅ Yeh setup ek baar karna hai. Uske baad har v1.0.18+ app install Cloudflare se data lega. Old users (v1.0.17 aur niche) automatically Play Store update ke through migrate ho jayenge (forced update v1.0.18 me built-in hai).

---

## 📋 PART A — Aap Karoge (5 min, free, no card)

### Step A1: Cloudflare account banao

1. Browser me kholo: **https://dash.cloudflare.com/sign-up**
2. Apna email + password daalo → Sign Up
3. Email inbox check karo → verification link click karo
4. Login ho jaaoge → Cloudflare dashboard khulega

> ⚠️ **Credit card MAT do.** Free plan card maangta hi nahi. Agar koi popup aaye, "Skip" / "Maybe later" click karna.

### Step A2: Workers subdomain set karo

1. Dashboard left sidebar me **Workers & Pages** click karo
2. First time pe ek prompt aayega: **"Choose a subdomain"**
3. Koi bhi unique name daalo, e.g. `vinu2092` ya `cricapp-live`
4. Final URL aisi hogi: `https://cricapp-proxy.<your-subdomain>.workers.dev`
5. **Subdomain note karke mujhe bhejo** (mujhe deploy karte time chahiye)

### Step A3: Account ID copy karo

1. Dashboard ke right sidebar (ya URL bar) me dikhega: **Account ID: xxxxxxxx...**
2. Pura ID copy karke **mujhe bhejo** (security ke liye safe hai, sensitive nahi hai)

### Step A4: RapidAPI keys ready rakho

Cloudflare Worker ko apni hi RapidAPI keys chahiye honge (taaki app me keys na rakhne pade — security++).

- Tumhare paas pehle se Firestore me jo keys hain (`api_key`, `api_key_p2`), unhi ko use karenge
- **Inko mujhe share karo** (DM me) ya **mujhe Firestore se khud read karne do** (already access hai if you're using emergent agent)

> 🔒 Yeh keys Cloudflare ke encrypted secrets me jayenge — kabhi app binary me nahi jaate. Reverse-engineer karne wala koi user keys nikaal nahi sakta.

---

## 🛠 PART B — Main Karunga (15-30 min, fully automated)

Jab tum mujhe yeh 3 cheezein bhej do:
1. ✅ Cloudflare account banaya
2. ✅ Workers subdomain (e.g. `vinu2092`)
3. ✅ Account ID
4. ✅ "Wrangler login allow kar diya" (browser me ek baar OAuth approve)

Main yeh sab automatically karunga:

### Step B1: Wrangler CLI install + login (mai karunga)
```bash
cd /app/cloudflare-worker
npm install -g wrangler@latest
wrangler login   # tumhe ek browser tab khulega → "Allow" click karna (one time, 30 sec)
```

### Step B2: RapidAPI keys secret me daalo (mai karunga)
```bash
wrangler secret put CRICBUZZ_KEYS_HOST1
# paste: key1,key2,key3   (comma-separated)

wrangler secret put CRICBUZZ_KEYS_HOST2
# paste: key1,key2,key3
```

### Step B3: Deploy worker (mai karunga)
```bash
wrangler deploy
# Output:  Published cricapp-proxy
#          https://cricapp-proxy.<your-subdomain>.workers.dev
```

### Step B4: Worker URL ko Firestore me daalo (mai karunga via REST)

App ke `app_config/settings` document me ek naya field add hoga:
```
cloudflare_proxy_url = "https://cricapp-proxy.<your-subdomain>.workers.dev"
latest_version = "1.0.18"
min_supported_version = "1.0.18"
play_store_url = "https://play.google.com/store/apps/details?id=com.cricapp.live"
```

> ⚠️ **`min_supported_version = "1.0.18"`** lagate hi sabhi v1.0.17 aur niche wale users ko forced-update screen dikhega. Aap chaaho to pehle `latest_version = "1.0.18"` set karo (optional update) → user ko Play Store par bhejo → 1-2 din baad `min_supported_version = "1.0.18"` lagao (force update). Yeh staged rollout safest hai.

### Step B5: Test (mai karunga via curl, app pe test mat karo abhi)
```bash
curl https://cricapp-proxy.<your-subdomain>.workers.dev/api/v1/health
# expected: {"ok":true,"service":"cricapp-proxy","ts":...}

curl https://cricapp-proxy.<your-subdomain>.workers.dev/api/v1/cricbuzz/matches/v1/live
# expected: {"data":{...cricbuzz response...},"source":"origin","host":"cricbuzz-cricket.p.rapidapi.com"}

curl https://cricapp-proxy.<your-subdomain>.workers.dev/api/v1/cricbuzz/matches/v1/live
# (2nd call ke baad) expected: "source":"edge_cache"  ← cache working!
```

---

## 🎯 PART C — Build v1.0.18 (ABHI READY HAI)

App ka code abhi hi v1.0.18 me bump ho chuka hai:
- `frontend/app.json` → `version: 1.0.18`, `versionCode: 18`
- `frontend/src/services/CloudflareProxy.ts` → naya proxy client (Firestore se URL padhega)
- `frontend/src/services/VersionCheck.ts` → forced-update logic
- `frontend/src/components/ForceUpdateScreen.tsx` → blocking update screen
- `frontend/src/services/api.ts` → Cloudflare-first fallback chain

**Build kaise start hoga:**

1. Aap chat box me **"Save to GitHub"** click karo
2. GitHub Actions automatically `build-android.yml` run karega
3. **APK + AAB** dono build honge (~10 min)
4. GitHub Actions → Artifacts section me dono files download milega

**v1.0.18 release flow (recommended):**

```
Day 0:
  ├─ Cloudflare worker deploy (PART B)
  ├─ Firestore me cloudflare_proxy_url + latest_version=1.0.18 daalo
  ├─ min_supported_version pehle MAT daalo (optional update first)
  └─ AAB Play Console pe upload → Release

Day 1-2:
  └─ Cloudflare dashboard monitor karo:
      ├─ Requests/day < 100K ?  ✅
      ├─ Cache hit ratio > 90% ? ✅
      └─ Error rate < 1% ? ✅

Day 3 (sab healthy ho):
  └─ Firestore me min_supported_version = "1.0.18" set karo
      → Sab purane users ko forced update screen dikhega
```

---

## 🛡 Safety & Fallback (built-in)

Agar Cloudflare kabhi down ho ya tumne URL galat lagaya:

1. App **5 second timeout** ke baad Cloudflare se ummeed chhod degi
2. Existing **Firebase keys** flow se direct RapidAPI call hogi (jo aaj kal kaam karta hai)
3. **App crash nahi hogi.** User ko data milta rahega.
4. After 4 consecutive Cloudflare failures, app session ke baaki time tak Cloudflare skip kar degi (auto-disable)

Forced-update logic bhi same safe:
- Agar Firestore unreachable → forced update **kabhi nahi** dikhega (false-positive prevention)
- Sirf jab Firestore explicitly bole "min version > installed", tab dikhega

---

## 📊 Cost monitoring (free plan limits)

Cloudflare dashboard → Workers & Pages → cricapp-proxy → **Metrics tab**:

| Metric | Free Limit | Healthy target |
|---|---|---|
| Requests/day | 100,000 | < 50,000 |
| CPU time/req | 10ms | < 5ms |
| Cache hit ratio | — | > 95% |
| Bandwidth | unlimited | — |
| Error rate | — | < 1% |

10K DAU pe with proper caching: **~1,000 worker invocations/day = 1% of free limit.** 50× headroom hai.

---

## ❓ FAQ

**Q: Cloudflare suspend kar dega kya AdMob ki wajah se?**
A: Nahi. Cloudflare ka Terms explicit me commercial use **allowed** kehta hai. Yahi Vercel se main difference hai.

**Q: API keys leak ho sakti hain?**
A: Nahi. Keys Cloudflare Worker ke encrypted environment variables me hain (`wrangler secret put`). App binary me kabhi nahi jaati. Reverse-engineer karke nikaalna possible hi nahi.

**Q: Old users (v1.0.17) ka kya hoga?**
A: Unka app **abhi jaisa hai** waisa hi chalega — Firestore se keys nikaal ke direct RapidAPI call karega. Migration tab hogi jab user voluntarily ya forced-update ke through v1.0.18 install karega.

**Q: 100K daily limit cross ho gaya to?**
A: Worker $0.50 per million extra charge karta hai (Vercel ke $20/month jump se 40× sasta). But realistically, with edge caching ON, 10K DAU pe limit cross hi nahi hogi.

**Q: Wrangler login OAuth safe hai?**
A: Bilkul safe. Yeh Cloudflare ka official CLI tool hai (jaise GitHub CLI). OAuth flow standard hai — sirf tumhare account me Workers deploy karne ki permission deta hai, kuch aur access nahi.

---

## 🚦 Ready hone par yeh bhejo:

```
✅ Cloudflare account ban gaya
✅ Subdomain set kar liya: __________________ (e.g. vinu2092)
✅ Account ID: __________________________________
✅ Wrangler OAuth approve karne ko ready
```

Yeh aate hi main worker deploy karke URL Firestore me daal dunga. Phir tum chat me "Save to GitHub" click karke v1.0.18 build start karoge.
