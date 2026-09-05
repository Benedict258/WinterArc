# Deployment Guide — Workspace v1

Target: **https://workspace.benedictisaac.dev**
Stack: Vite + React PWA (frontend) + Express API + MongoDB Atlas (database)

---

## Option A — Render (recommended, ~10 min)

Best fit for this stack: persistent Node process, free HTTPS, custom domain, no cold starts.

### 1. Push to GitHub

```bash
git init  # if not already
git add .
git commit -m "v1.0 production-ready"
git remote add origin git@github.com:Benedict258/Workspace.git
git push -u origin main
```

### 2. Create Web Service on Render

1. Go to https://dashboard.render.com → **New** → **Web Service**
2. Connect `Benedict258/Workspace` repo
3. Configure:
   - **Environment:** Node
   - **Region:** Oregon (or closest to your Atlas region)
   - **Branch:** `main`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `NODE_ENV=production node dist/server.cjs`
   - **Health Check Path:** `/api/health`
   - **Instance Type:** Starter ($7/mo) or Free (spins down after 15 min idle)

### 3. Environment Variables (Render → Environment tab)

> Copy values from your local `.env` file (gitignored). Never commit secrets.

| Key | Value (placeholder — use your own) |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | `<your-mongodb-atlas-uri>` |
| `FRONTEND_URL` | `https://workspace.benedictisaac.dev` |
| `GOOGLE_CLIENT_ID` | `<your-google-oauth-client-id>` |
| `GOOGLE_CLIENT_SECRET` | `<your-google-oauth-client-secret>` |
| `GOOGLE_REDIRECT_URI` | `https://workspace.benedictisaac.dev/api/calendar/callback` |

### 4. Custom Domain

- Render → Settings → Custom Domains → add `workspace.benedictisaac.dev`
- At your DNS provider (Cloudflare/etc.):
  - **CNAME** `workspace` → `<your-service>.onrender.com`
- Render auto-provisions Let's Encrypt cert.

### 5. Atlas IP Allowlist

- Atlas → Network Access → **Add IP Address** → `0.0.0.0/0` (Render egress IPs vary; safer alternative below)

**Better:** Atlas has a feature "Connect from Anywhere" toggle, OR add Render's published IP range.

### 6. Verify

Visit `https://workspace.benedictisaac.dev/api/health` → should return `{ "status": "ok", "mongoConnected": true }`.

Open the site — passcode gate (`BenedictIsaac#258`) → Today / Week / Goals views should show live data from your Atlas cluster.

---

## Option B — AWS App Runner (~20 min)

If you prefer AWS ecosystem.

### 1. Add Dockerfile at project root

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

### 2. Push to ECR

```bash
aws ecr create-repository --repository-name workspace
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker build -t workspace .
docker tag workspace:latest <account>.dkr.ecr.us-east-1.amazonaws.com/workspace:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/workspace:latest
```

### 3. App Runner service

- Source: ECR
- Port: 3000
- Env vars: same table as Render
- Health check: `/api/health`
- Custom domain via ACM certificate

### 4. Atlas Network Access → add App Runner's egress IPs (or 0.0.0.0/0 for simplicity)

---

## Option C — Vercel (deferred — not ideal)

Vercel would split frontend/serverless, but the Express server is a long-running Node process that doesn't map cleanly to Vercel functions. Stick with Render or AWS App Runner.

---

## Post-Deploy Checklist

- [ ] `https://workspace.benedictisaac.dev/api/health` → 200 with `mongoConnected: true`
- [ ] Passcode gate appears on first visit
- [ ] Today view shows today's tasks (seed: 30 threads → after first "Regenerate Week" run, you get ~80+ tasks for the week)
- [ ] Complete a task → it persists after refresh
- [ ] Goals view shows quarter label (Q3-2026) with 0% completion initially
- [ ] Add a thread → it appears across all views
- [ ] Open on phone (DevTools mobile mode) — Week view stacks days; Today view is single-column; Goals cards wrap

---

## Monitoring (nice-to-have)

- **Uptime:** UptimeRobot free tier → ping `/api/health` every 5 min
- **Errors:** Add Sentry (`@sentry/react` + `@sentry/node`) — 5 min setup, free tier
- **Logs:** Render has built-in log streaming; for AWS, use CloudWatch

---

## Rollback

Both Render and App Runner keep the previous deploy active. To roll back:
- **Render:** Manual Deploy → pick previous commit → Deploy
- **App Runner:** Update service to previous ECR image tag

The seed function is **idempotent** (only inserts when collections are empty), so restarts never duplicate data.

---

## Cost Estimate

| Service | Free Tier | Paid |
|---|---|---|
| Render Web Service | 750 hr/mo free (spins down after 15 min) | $7/mo always-on |
| MongoDB Atlas M0 | 512 MB free forever | — |
| Custom domain | — | ~$10/yr |
| **Total** | **$0** (with cold starts) | **~$17/mo** |
