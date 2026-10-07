# Deploying WinterArc (Vercel + Render)

```
browser ──► Vercel (static React app, PWA)
              │  /api/*  rewritten (proxied) to ──► Render (Express API) ──► MongoDB Atlas
              │                                            └─► S3 / R2 (Drop files, presigned URLs)
```

- **Vercel** serves the built frontend from `dist/` and proxies every `/api/*`
  request to Render (`vercel.json`). The browser only ever talks to one origin,
  so the session cookie is first-party and `SameSite=Lax` keeps working.
- **Render** runs `dist/server.cjs` — API only (`render.yaml`).
- **MongoDB Atlas** stays where it is.
- **Drop files** go straight from the browser to an S3-compatible bucket via
  presigned URLs. AWS S3 still works from Render; if you're leaving AWS
  entirely, use Cloudflare R2 (free tier, S3-compatible) — just set `S3_ENDPOINT`.

---

## 1. MongoDB Atlas

1. **Rotate the database password** (the old one is in git history).
   Atlas → Database Access → edit user → new password.
2. **Network Access** → add `0.0.0.0/0`. Render's free tier has no fixed
   outbound IPs, so the old EC2 IP allow-list won't work.

## 2. Render (API)

1. Render dashboard → **New → Blueprint** → pick the `Benedict258/WinterArc` repo.
   It reads `render.yaml` and creates the `winterarc-api` web service.
2. When asked, fill in the secret env vars:

   | Key | Value |
   |---|---|
   | `MONGO_URI` | Atlas connection string (with the **new** password) |
   | `APP_PASSCODE` | your lock-screen passcode |
   | `S3_DROP_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | storage (see §4); leave empty to run without file uploads |
   | `S3_ENDPOINT` | empty for AWS, `https://<account-id>.r2.cloudflarestorage.com` for R2 |

   `SESSION_SECRET` is generated automatically; `NODE_ENV`, `TRUST_PROXY=2`
   and `FRONTEND_ORIGIN` are preset.
3. Deploy, then check `https://winterarc-api.onrender.com/api/health`
   → `{"status":"ok","mongoConnected":true}`.

   If Render gave the service a different URL (name taken), update the
   `destination` in `vercel.json` to match.

**Free plan note:** the service sleeps after 15 min idle and takes ~30–60 s
to wake. Today's schedule is still generated on the first request after it
wakes, so nothing is missed. To avoid the wake-up delay, either use a paid
instance or point a free uptime pinger (e.g. cron-job.org) at `/api/health`
every 10 minutes.

## 3. Vercel (frontend)

1. Vercel → **Add New → Project** → import `Benedict258/WinterArc`.
2. Framework preset, build command and output dir come from `vercel.json`
   (Vite, `npm run build:client`, `dist`). No env vars needed — leave
   `VITE_API_URL` unset.
3. Deploy, open the `*.vercel.app` URL and log in.
4. **Domain:** Project → Settings → Domains → add
   `winterarc.benedictisaac.dev`, then update the DNS record at your registrar
   as Vercel instructs (replacing the old EC2 A record).

## 4. Drop storage

Whichever provider you use, the bucket needs a **CORS rule** so the browser
can upload/download directly:

```json
[
  {
    "AllowedOrigins": ["https://winterarc.benedictisaac.dev", "https://<your-project>.vercel.app"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

- **AWS S3 (keep existing `winterarc-drop` bucket):** S3 → bucket →
  Permissions → CORS → paste the above (replace the old origin). Use an IAM
  user limited to `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on
  `arn:aws:s3:::winterarc-drop/drop/*`.
- **Cloudflare R2:** create bucket → Settings → CORS policy (same rule) →
  R2 API token with Object Read & Write on that bucket. Set
  `S3_REGION=auto` and `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`.
  Existing files in S3 aren't copied; drops expire after 30 days anyway.

Drop items expire after 30 days (Mongo TTL). With R2/S3 you can add a
30-day lifecycle rule on the `drop/` prefix to delete the files too.

## 5. One-time data cleanup

The old weekly generator left bare thread-name tasks in the database. Before
the first request hits the new API (or right after), run locally with the
production `MONGO_URI` in `.env`:

```bash
npm run cleanup:legacy-grid            # dry run — shows what it would delete
npm run cleanup:legacy-grid -- --apply
```

## 6. Retire AWS

Once Vercel + Render are serving the domain:

- `pm2 delete workspace` on the EC2 box, then stop/terminate the instance
  and release its Elastic IP.
- Delete the EC2 key pair (`WinterArc.pem`) in AWS and locally.
- If you moved Drop to R2: delete the S3 bucket and the IAM user's keys.

---

## Local development

```bash
cp .env.example .env    # fill in MONGO_URI, APP_PASSCODE
npm install
npm run dev             # http://localhost:3000 (API + Vite dev server)
npm test                # unit tests
npm run typecheck
```

`.env` points wherever `MONGO_URI` says — use a separate dev database,
not production.

## Environment variables

| Key | Required | Notes |
|---|---|---|
| `MONGO_URI` | yes | |
| `APP_PASSCODE` | yes | |
| `SESSION_SECRET` | prod | 32+ chars |
| `TRUST_PROXY` | | proxy hops: `2` behind Vercel→Render, `1` default |
| `FRONTEND_ORIGIN` | | comma-separated CORS origins |
| `PORT` | | set by Render; default 3000 |
| `S3_DROP_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for Drop files | `AWS_*` names also accepted |
| `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | | for non-AWS providers |
