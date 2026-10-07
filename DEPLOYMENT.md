# Deploying WinterArc (Vercel + Render)

```
browser ──► Vercel (static React app, PWA)
              │  /api/*  rewritten (proxied) to ──► Render (Express API) ──► MongoDB Atlas
              │                                            └─► Backblaze B2 (Drop files, presigned URLs)
```

- **Vercel** serves the built frontend from `dist/` and proxies every `/api/*`
  request to Render (`vercel.json`). The browser only ever talks to one origin,
  so the session cookie is first-party and `SameSite=Lax` keeps working.
- **Render** runs `dist/server.cjs` — API only (`render.yaml`).
- **MongoDB Atlas** stays where it is.
- **Drop files** live in a private **Backblaze B2** bucket (10 GB free, no card
  needed). The browser uploads/downloads directly using short-lived presigned
  URLs from the API, via B2's S3-compatible API. (Any S3-compatible store works
  — only the `S3_*` env vars change.)

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
   | `S3_DROP_BUCKET` | B2 bucket name (see §4) |
   | `S3_ACCESS_KEY_ID` | B2 application **keyID** |
   | `S3_SECRET_ACCESS_KEY` | B2 **applicationKey** |
   | `S3_REGION` | B2 region, e.g. `us-west-004` |
   | `S3_ENDPOINT` | `https://s3.<region>.backblazeb2.com`, e.g. `https://s3.us-west-004.backblazeb2.com` |

   Leave the `S3_*` vars empty to run without file uploads (text/link drops still work).

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

## 4. Drop storage (Backblaze B2)

1. Sign up at backblaze.com → **B2 Cloud Storage** (free tier, no card).
2. **Buckets → Create a Bucket**
   - Name: e.g. `winterarc-drop` (must be globally unique)
   - Files in bucket: **Private**
   - Encryption: on (SSE-B2) is fine
   - Note the **Endpoint** shown on the bucket card, e.g.
     `s3.us-west-004.backblazeb2.com` → region is `us-west-004`.
3. **Lifecycle Settings** (on the bucket) → **Keep only the last version of the
   file**. B2 keeps old versions by default, so without this, deleted drops would
   still count against your 10 GB.
4. **CORS rule (uploads need a custom rule).** The CORS options in the B2
   web UI only allow *downloads*, so browser uploads fail with a 403
   preflight. Set a custom rule with the B2 CLI (`pip install b2`, v4):

   ```bash
   b2 account authorize            # with a key that has writeBuckets
   b2 bucket update winterarc-drop --cors-rules '[{
     "corsRuleName": "winterarc",
     "allowedOrigins": ["https://winterarc.benedictisaac.dev", "http://localhost:3000"],
     "allowedOperations": ["s3_get", "s3_head", "s3_put"],
     "allowedHeaders": ["content-type"],
     "exposeHeaders": ["etag"],
     "maxAgeSeconds": 3600
   }]'
   ```

   Add your `https://<project>.vercel.app` URL to `allowedOrigins` if you want
   uploads to work there too.
5. **Application Keys → Add a New Application Key**
   - Allow access to bucket: **only `winterarc-drop`**
   - Type of access: **Read and Write**
   - Copy the **keyID** and **applicationKey** (shown once).
6. Put these into Render (§2) — and into your local `.env` to test:

   ```env
   S3_DROP_BUCKET=winterarc-drop
   S3_ACCESS_KEY_ID=<keyID>
   S3_SECRET_ACCESS_KEY=<applicationKey>
   S3_REGION=us-west-004
   S3_ENDPOINT=s3.us-west-004.backblazeb2.com   # https:// is optional
   ```
7. Verify everything (keys, region, CORS, upload/download/delete):

   ```bash
   npm run storage:check
   ```

   It prints `Storage is ready for Drop.` or tells you which step failed.

Drop items expire after 30 days (Mongo TTL). To also delete the files, add a
B2 lifecycle rule with file name prefix `drop/`: *days from uploading to
hiding* = 30, *days from hiding to deleting* = 1.

Files currently in the old S3 bucket aren't migrated; drops are temporary
(30 days) by design.

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
- Delete the old `winterarc-drop` S3 bucket and the IAM user/access keys the
  app used.

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
| `S3_DROP_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for Drop files | B2 bucket, keyID, applicationKey |
| `S3_REGION`, `S3_ENDPOINT` | for Drop files | B2 region + `https://s3.<region>.backblazeb2.com` |
| `S3_FORCE_PATH_STYLE` | | only for MinIO-style endpoints |
