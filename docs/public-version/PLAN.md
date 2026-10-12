# WinterArc Public Version — Plan

Status: draft for review. Lives on branch `public-app`; the personal app (`main`) is untouched and keeps running.

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Audience / pricing | Not decided. Build with plan limits + invite codes switchable on later (no payments in v1). |
| Sign-in | Email + password, plus "Continue with Google". Email verification and password reset. |
| Platforms at launch | Web, Android, desktop apps. |
| Scale target (6 months) | 100 to 5,000 users. |
| Customization at launch | Look & feel, own day structure, planner rules, modules on/off. |
| Existing data | Kept separate. New DB; optional one-time import of the owner's data later. |
| Social | Solo at launch → accountability partners → shared threads/teams. Schema prepared, features later. |
| Onboarding | Guided setup + starter templates. |
| Stack | Keep MongoDB + Express + React; add `userId` tenancy. |
| Notifications | Browser/desktop push, on-device phone reminders, email. |
| Android | Beta via APK, then Play Store. |
| Name | Keep WinterArc (name lives in one config place). |
| Budget | $0 while testing, up to ~$25/mo at launch. Two setups are costed in §9. |
| Drop | Kept, with a per-user storage quota. |
| Extras | Per-user Google Calendar, import from other apps, AI planning assistant. Data export + account deletion are required anyway (Play Store). |
| AI | Break goals into steps, suggest a week plan, chat about the workspace, weekly review. Free monthly allowance per user; more usage on request; paid tiers and bring-your-own-key later. |
| Admin | Yes: users, usage, suspend, delete. |
| Timeline | As fast as possible → ship a thin core first, extras after (§7). |

## 2. Separation from the current app

- Branch `public-app`, built from the current code. Never merged back into `main`.
- Own deployment: separate Render service, Vercel project, MongoDB database (a new database on the same Atlas cluster is fine at first), Backblaze bucket, and VAPID keys.
- Android gets a **new application id** (e.g. `dev.benedictisaac.winterarc.app`) so it installs next to the personal app and gets its own Play listing. Needs its own signing key.
- GitHub Actions for this branch deploy only from `public-app`.

## 3. Architecture changes

**Tenancy.** Every document gets `userId` (indexed, first field of every compound index). One request-scoped helper builds all queries (`scoped(req.user.id)`), so a route cannot forget the filter. Cross-user access tests are mandatory.

**Auth.** `User { email (unique, lowercased), passwordHash (argon2id), googleId?, emailVerifiedAt, status: active|suspended|deleted, role: user|admin, createdAt }`. Sessions: cookie for web, bearer token for native (already built; tokens become per-user). Rate limits per IP and per account, lockout, email verification required before sync/push, password reset by emailed one-time link.

**Per-user settings** replace the single Settings doc: timezone, week start, theme, accent, density, day structure (blocks: name, start/end, which intensities prefer it), planner rules (daily cap, rollover, backlog filler count, makeup on/off, busy-day behavior), modules enabled, notification preferences.

**Planner.** Pure functions already take options; make them take the user's day structure and rule set instead of constants. The daily generator runs per user at that user's local midnight, not on first request.

**Notifications.** Push subscriptions belong to a user. The 5-minute tick finds only users whose local time is near a reminder (indexed by next-due minute) instead of looping everyone. Email via a provider (Resend free tier at first).

**Drop.** Per-user quota (default 200 MB), files expire after 30 days, upload URLs check remaining quota, orphan cleanup job.

**AI assistant.** Server-side calls to the Claude API with the user's workspace summarized into context; tools for "create thread", "queue tasks", "rebalance". Every call metered per user (tokens) against a monthly allowance; hard daily/monthly caps; plan tier raises the cap.

**Google Calendar.** Per-user OAuth. Public use needs Google's OAuth verification (weeks; needs privacy policy, demo video, domain). Start the application early; until approved it runs in "Testing" mode for up to 100 named users.

**Admin.** Role-gated area: user list, usage (storage, AI tokens, last seen), suspend/unsuspend, delete, invite codes.

**Compliance.** Privacy policy and terms, in-app account deletion (hard-deletes data + files), data export (JSON), consent for notifications. Aim for NDPR/GDPR basics. Never log passcodes, tokens or task contents.

**Social (later).** Prepare `Connection { userId, partnerId, status }` and `ThreadMember { threadId, userId, role }` but ship no UI in v1.

## 4. Data model (new or changed)

`User`, `UserSettings`, `Template`, `PushSubscription(+userId)`, `ApiToken(+userId)`, `Thread/Task/Goal/WishlistItem/DropItem/CalendarSync/NotificationLog (+userId)`, `AiUsage { userId, month, tokens }`, `InviteCode`, `EmailToken { userId, kind, hash, expiresAt }`, `AuditLog` (admin actions).

## 5. Migration of the existing data

Not automatic. An optional "Import from WinterArc export" (the app already has `/api/export`) maps the owner's file into a new account.

## 6. Customization details

- **Look & feel:** theme presets + accent color + light/dark/system + comfortable/compact. Stored per user, applied before first paint.
- **Day structure:** 2 to 6 blocks, each with name, optional hours, and an intensity preference. Planner uses them; events pick the block containing their start time.
- **Planner rules:** daily cap, busy-day behavior, rollover on/off, backlog filler (0 to 5/day), fixed-day makeup on/off, due-window days.
- **Modules:** Wishlist, Goals/analytics, Drop, Events, AI each toggled; nav hides disabled modules.
- **Templates:** starter packs (Student, Developer, Fitness, Creator, Blank), each a set of threads + example tasks + a suggested day structure.

## 7. Milestones (fastest path to strangers using it)

**Beta-critical**
1. **M0 Setup:** branch, new Render/Vercel/Atlas/B2/Resend, new app id + signing key, CI deploys from `public-app`.
2. **M1 Identity & tenancy:** User model, signup/login/logout, email verify + reset, Google sign-in, `userId` on everything, scoped data layer, isolation tests. Native bearer tokens per user.
3. **M2 Per-user settings & planner:** UserSettings, planner takes day structure/rules, per-user daily generation by timezone.
4. **M3 Onboarding & templates:** wizard + starter packs.
5. **M4 Customization UI:** theme, day structure editor, planner rules, module toggles.
6. **M5 Per-user notifications + email:** push/phone reminders tied to users, scalable tick, verification/reset/digest emails.
7. **M6 Compliance + admin-lite:** export, delete account, privacy/terms pages, rate limits, admin user list + suspend.
8. **Private beta:** web + APK to invited users (invite codes on).

**After beta**
9. **M7 Drop quota** · 10. **M8 AI assistant** · 11. **M9 Google Calendar per user** (submit for verification during M1) · 12. **M10 Import (CSV/Todoist/Notion)** · 13. **Play Store release** · 14. **Partners** · 15. **Shared threads/teams**.

## 8. Testing & safety

- Unit tests for planner with custom day structures/rules (existing suite extended).
- API tests that user A can never read/write user B's data on every route (table-driven).
- Auth tests: lockout, reset-token expiry/reuse, suspended users blocked everywhere, token revocation.
- Load smoke test for the notification tick at 5,000 users.
- Backups: enable Atlas backups before real users; restore drill once.

## 9. Cost (rough, monthly)

| | Testing | Launch (~1k users) |
|---|---|---|
| Render API | $0 (sleeps) | $7 to $25 always-on |
| MongoDB Atlas | $0 (M0) | $0 to $9 (shared); backups need M10+ ≈ $57 or use dump jobs |
| Vercel | $0 | $0 |
| Backblaze B2 | $0 (10 GB) | ~$0.006/GB |
| Email (Resend) | $0 | $0 (3k/mo) then $20 |
| AI | $0 | pay per use; cap per user |
| Play Store | $25 once | — |
| Domain | ~$12/yr | — |

Setup A (cheapest): free tiers + external pinger, accept cold starts. Setup B: paid always-on API (removes the pinger), ~$25. Recommend A for beta, B at public launch.

## 10. Risks

- **Google OAuth verification** can take weeks: start early or ship Calendar later.
- **Free-tier sleep** delays reminders: pinger for beta, paid instance for launch.
- **Tenancy bugs** are the biggest security risk: scoped data layer + isolation tests before any beta user.
- **Scope creep** from social/AI: gated behind milestones after beta.
- **Abuse** (spam signups, storage, AI): email verification, rate limits, quotas, caps, admin suspend.

## 11. Still to decide

1. Branch name (`public-app` proposed) and Android application id.
2. Domain and email sender domain.
3. Where the admin account comes from (first verified email matching an env var).
4. Whether beta needs invite codes from day one (recommended: yes).
5. Template content and privacy-policy wording (I draft, you review).
