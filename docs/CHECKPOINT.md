# Checkpoint: 17 October 2026 (branch `WinterArcBeta`)

Commit: `3e1d1f4` on `WinterArcBeta` (a git tag could not be pushed from this environment). Everything below is built, tested and pushed. The personal app on `main` is untouched.

## What exists
- **Accounts and safety:** email + Google sign-in, invite codes, email confirmation, per-user data (tenant guard + isolation tests), admin area, export and account deletion, Privacy Policy and Terms (version `2026-10-16`), strict CSP.
- **Planner:** tasks, threads, backlog, goals, wishlist, custom day blocks (2-6), planner rules, onboarding templates, offline queue, imports (CSV, Todoist, Notion, WinterArc export).
- **Reminders:** web push, on-device phone reminders, daily email digest.
- **Drop** with quotas, **partners**, **shared threads**, **paid tiers** (Paystack built but off).
- **AI assistant** (Groq default, NVIDIA NIM or custom): proposes changes you approve; logs habits, workouts, steps, measurements and meals directly and shows what it saved.
- **Focus timer + routines**, **Habits** (streaks, monthly averages, milestone/evening/monthly pushes), **Fitness** (workouts, steps, body measurements, charts, Android Health Connect sync), **Nutrition** (AI meal estimates you can correct, goals, advisor).
- **Connector for AI apps** (Claude, ChatGPT, others): OAuth 2.1 + PKCE + dynamic registration, consent page, ~40 scoped MCP tools, Settings -> Connected apps. See `DEPLOYMENT_BETA.md` section 12.

## Checks at this checkpoint
Typecheck, lint, 445 automated tests (incl. real-MongoDB CI and the official MCP client), 39-check production browser journey, and browser runs for focus/routines, habits, fitness, nutrition and the connector all passing.

## Waiting on the owner
1. GitHub repo **Variables**: `BETA_API_BASE` (a variable, not a secret). Secrets: `ANDROID_BETA_KEYSTORE_BASE64`, `ANDROID_BETA_KEYSTORE_PASSWORD`, `ANDROID_BETA_KEY_ALIAS`.
2. `APP_URL` on Render = the exact Vercel address; redeploy so the new `vercel.json` rewrites (`/mcp`, `/oauth/*`, `/.well-known/*`) are live.
3. A paid always-on Render instance (the connector's sign-in endpoints must answer in under 10 seconds).
4. Test the Android build, Health Connect sync, and a real Claude / ChatGPT connection.

## Not verified yet
Android build with the Health Connect plugin; a real Claude or ChatGPT connecting to the live site; anything on a phone.

## On hold by decision
Paystack payments (leave `PAYSTACK_SECRET_KEY` unset), Play Console account and closed test, per-user Google Calendar, and which features belong to Free / Pro / Plus (everything is free for now).

## Next
Decide the plan tiers; fix whatever the Android and connector tests turn up; then decide what happens to `main` (the personal app).
