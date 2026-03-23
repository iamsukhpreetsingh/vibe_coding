# ☁️ CloudVault

Personal Mega.nz cloud dashboard. Single-user, self-hosted, deploys to Railway via GitHub Actions.

---

## Local Development

```bash
cp .env.example .env        # fill in your values
npm install
npm start
# → http://localhost:3000
```

---

## Production Deployment (Railway + GitHub Actions)

### Step 1 — Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Empty Project**
2. Name it `cloudvault`
3. Add a **PostgreSQL** plugin: **+ New → Database → PostgreSQL**
4. Copy the **DATABASE_URL** from the PostgreSQL plugin's "Connect" tab

### Step 2 — Set Railway environment variables

Railway → your service → **Variables**:

| Variable         | Value                         | Notes                          |
|------------------|-------------------------------|--------------------------------|
| ADMIN_USERNAME   | yourname                      | Your login username            |
| ADMIN_PASSWORD   | a-strong-password             | Your login password            |
| ADMIN_EMAIL      | you@example.com *(optional)*  | Cosmetic only                  |
| DATABASE_URL     | *(from PostgreSQL plugin)*    | Auto-injected in same project  |
| JWT_SECRET       | *(random 48-char hex)*        | openssl rand -hex 48           |

### Step 3 — Get Railway token

Railway → Account Settings → **Tokens → New Token** → copy it.

### Step 4 — Add GitHub Secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret name     | Value                    |
|-----------------|--------------------------|
| RAILWAY_TOKEN   | token from Step 3        |

### Step 5 — Push to GitHub

```bash
git init
git remote add origin https://github.com/YOU/cloudvault.git
git add .
git commit -m "Initial deploy"
git push -u origin main
```

GitHub Actions deploys automatically on every push to `main`.
Manual trigger: Actions tab → Deploy CloudVault → Run workflow.

### Step 6 — Generate domain

Railway → your service → **Settings → Domains → Generate Domain**

---

## How Auth Works

Single-user mode — no registration.

- Login checks username + password against ADMIN_USERNAME / ADMIN_PASSWORD env vars
- On first login, a persistent user row is created in DB (stores profile + Mega accounts)
- Issues a 30-day JWT
- To change password: update ADMIN_PASSWORD in Railway and redeploy

---

## Environment Variables

```env
ADMIN_USERNAME=yourname
ADMIN_PASSWORD=a-strong-password
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=<48-char hex>
ADMIN_EMAIL=you@example.com   # optional
PORT=3000                      # Railway sets this automatically
```
