# JobTruth — Deploy Guide

## Project Structure

```
jobtruth/
├── public/
│   └── index.html        ← Your entire frontend (users see this)
├── api/
│   └── analyze.js        ← Serverless function (keys live here, hidden from users)
├── vercel.json           ← Vercel routing config
└── README.md
```

## How Keys Stay Hidden

```
User's browser ──POST /api/analyze──▶ Vercel Edge Function
                                            │
                    ┌───────────────────────┤
                    │  GEMINI_API_KEY ✓     │  Keys stored in Vercel
                    │  GROQ_API_KEY   ✓     │  Environment Variables
                    └───────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  Try Gemini → Try Groq     │
              │  → Offline fallback        │
              └────────────────────────────┘
```

Users only ever see `{ result: "...", source: "gemini" }` — never the keys.

---

## Deploy to Vercel (Free, ~5 minutes)

### Step 1 — Push to GitHub
```bash
# Create a new repo on github.com, then:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOURUSERNAME/jobtruth.git
git push -u origin main
```

### Step 2 — Connect to Vercel
1. Go to **vercel.com** → Sign in with GitHub (free)
2. Click **"Add New Project"**
3. Import your `jobtruth` GitHub repo
4. Framework Preset: **Other**
5. Root Directory: leave blank (it reads `vercel.json` automatically)
6. Click **Deploy** — wait ~30 seconds

### Step 3 — Add your API keys (Environment Variables)
In your Vercel project dashboard:
1. Go to **Settings → Environment Variables**
2. Add these two variables:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | `AIza...` (from aistudio.google.com/app/apikey) |
| `GROQ_API_KEY` | `gsk_...` (from console.groq.com/keys) |

3. Click **Save**
4. Go to **Deployments → Redeploy** (so the new env vars take effect)

### Step 4 — Done!
Your site is live at `https://jobtruth.vercel.app` (or your custom domain).

---

## Get Free API Keys

### Gemini — 1,500 requests/day free
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google
3. Click **Create API key**
4. Copy it → paste into Vercel env var `GEMINI_API_KEY`

### Groq — Very generous free tier (used as fallback)
1. Go to https://console.groq.com/keys
2. Sign up (free)
3. Click **Create API key**
4. Copy it → paste into Vercel env var `GROQ_API_KEY`

---

## Custom Domain (Free)
In Vercel → Settings → Domains → Add your domain.
Vercel gives you a free `.vercel.app` subdomain automatically.
For a custom domain like `jobtruth.com`, buy it (~$10/yr on Namecheap/Porkbun) and point it to Vercel.

---

## Limits (Free Tier)
| Service | Free Limit |
|---------|-----------|
| Vercel hosting | Unlimited static, 100GB bandwidth/mo |
| Vercel serverless functions | 100,000 invocations/mo |
| Gemini 2.0 Flash | 1,500 requests/day |
| Groq LLaMA 3 | ~14,400 req/day (very generous) |
| Reddit public API | ~60 req/hr per IP |

For a personal or small project, all of these are more than enough.
