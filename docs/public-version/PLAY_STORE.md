# Releasing WinterArc on Google Play

Everything here is ready to paste or follow. Things only you can do (they need your Google account, money or identity) are marked **You**.

## 0. Decide first: the package name
The package name is **permanent** once an app is on Google Play. The beta builds use `dev.benedictisaac.winterarc.beta`.
- Happy with that? Do nothing.
- Want a clean one (for example `dev.benedictisaac.winterarc.app`)? Before the first upload, add a repository variable **`ANDROID_APP_ID`** in GitHub (Settings → Secrets and variables → Actions → Variables). The build uses it for both the Android package and the Capacitor config. Installing the beta and the store app side by side then keeps working.

## 1. Accounts and keys (You)
1. Google Play Console account: one-time $25 fee, identity verification. A *personal* account created after November 2023 must run a **closed test with at least 12 testers for 14 days** before it can publish to production. An *organisation* account (needs a D-U-N-S number) skips this.
2. Signing: the workflow signs with your keystore (`ANDROID_BETA_KEYSTORE_BASE64`, `ANDROID_BETA_KEYSTORE_PASSWORD`, `ANDROID_BETA_KEY_ALIAS`). Keep the keystore safe and backed up; in Play Console choose **Play App Signing** (default) so Google holds the final key and yours is only the upload key.
3. GitHub repository variable `BETA_API_BASE` = your Render API address.

## 2. Build the bundle
Every push to `WinterArcBeta` that touches the app (or **Actions → Android app (beta) → Run workflow**) builds a signed `.aab` and attaches it to a GitHub Release. Version code = the workflow run number, so each build is newer than the last. Upload the `.aab` in Play Console → **Testing → Closed testing → Create release**.

## 3. Store listing
**App name:** WinterArc
**Short description (80):** Plan your days with threads, a smart daily planner and gentle reminders.
**Full description:**
```
WinterArc turns the things you want to get done into a plan that fits your day.

THREADS, NOT TO-DO PILES
Group your work into threads (a project, a habit, a course) and say how often each should show up: daily, a few times a week, weekly, or on a fixed day. WinterArc spreads them across your week for you.

A PLANNER THAT UNDERSTANDS YOUR DAY
Split your day into 2 to 6 blocks and tell it where heavy, medium and light work fits best. It places tasks to match, keeps days from overflowing, brings missed work back, and makes up fixed-day sessions you missed.

WORKS WITHOUT A SIGNAL
Add and tick off tasks offline. Everything syncs when you're back online.

REMINDERS THAT FIT
A morning plan, due tasks and event reminders on your phone, plus an optional daily email.

GET HELP, STAY IN CONTROL
Ask the built-in assistant to break a goal into steps or plan your week. It only suggests; nothing changes until you approve it.

KEEP EACH OTHER GOING
Invite an accountability partner and share just what you choose: your streak, your week, or nothing. Share a thread with a team and assign tasks.

MADE YOUR WAY
Pick your colours, density, day structure and planner rules, and switch off what you don't use. Import from CSV, Todoist or Notion. Download or delete all your data any time.
```
**Category:** Productivity · **Tags:** Planner, To-do list, Habit tracker · **Contact email:** your support address · **Website:** your Vercel address
**Privacy policy URL:** `https://YOUR-SITE/privacy` · **Account deletion URL (required):** `https://YOUR-SITE/delete-account`

**Graphics** are in `store-assets/`:
| File | Use |
|---|---|
| `icon-512.png` | App icon (512 × 512) |
| `feature-graphic-1024x500.png` | Feature graphic |
| `1-today.png` … `5-settings-violet.png` | Phone screenshots (1080 × 2160, five of them; Play needs at least two) |
Replace them with fresh captures after big design changes.

## 4. App content forms (Play Console → Policy → App content)
- **Target audience:** 13 and over (not designed for children).
- **Ads:** No.
- **App access:** reviewers cannot sign up without an invite code. Choose "Some functionality is restricted" and give them: a **demo account** (create one, confirm its email, and put its address and password here) or a **reusable invite code** (Admin page → Invite codes, 20 uses, 90 days). Add a note: "Sign in with the account above. Open Today, Threads, Settings."
- **Content rating:** answer "No" to violence, sexual content, language, controlled substances, gambling. User-generated content: there is none shared publicly (only with people the user invites), so answer accordingly. Expected rating: Everyone / 3+.
- **News app / Government / Health:** No.
- **Financial features:** none inside the app. (The Pro plan is paid through the web; see section 6.)
- **Exact alarms:** the app asks for `SCHEDULE_EXACT_ALARM` so event reminders fire on time. If Play Console asks for a declaration, say: "Core function: planner with timed event reminders the user schedules." If you would rather avoid the declaration, delete that one `<uses-permission>` line in `android/app/src/main/AndroidManifest.xml`; reminders then arrive a few minutes late on some phones.

## 5. Data safety form
| Question | Answer |
|---|---|
| Collects or shares user data? | Collects: yes. Shares with third parties: no (service providers acting for us only) |
| Encrypted in transit? | Yes |
| Users can request deletion? | Yes (in the app and at the deletion URL) |

Data types to declare as **collected** (all: *not shared*, purpose *App functionality*, plus *Account management* where noted):
- **Personal info → Email address** (required; account management) and **Name** (optional).
- **Personal info → User IDs** (account id).
- **App activity / Other user-generated content:** tasks, threads, goals, notes, Drop text and links.
- **Files and docs:** files the user adds to Drop (optional).
- **Device or other IDs:** push-notification address, only if the user turns on reminders.
- **Financial info → Purchase history:** only if paid plans are on (payment reference and amount, handled by Paystack).
Not collected: location, contacts, photos/videos (except files the user picks), microphone, health, browsing history, advertising ID.
Optional processing to mention if asked: AI assistant messages are sent to the AI provider only when the user uses that feature.

## 6. Payments and Google's rules
Google requires digital subscriptions sold inside an app to use **Google Play Billing**, and doesn't let an app point users to other payment methods. So the Android app **shows the plan and usage but sells nothing and links nowhere** (it says plans are managed on the website). Paying happens only in a normal browser at `/billing`. That is already how the app behaves; no extra work is needed for the store build. If you later want to sell inside the app, that means adding Play Billing (a separate piece of work).

## 7. Release checklist
- [ ] Package name decided (section 0)
- [ ] Support email set (`SUPPORT_EMAIL`) and shown on the privacy page
- [ ] Privacy policy and terms read by you (and ideally a lawyer)
- [ ] Atlas backups on; Render on an always-on plan; Resend domain verified; Groq on the paid developer plan
- [ ] Closed test running with 12+ testers for 14 days (personal accounts)
- [ ] Data safety, content rating, app access, ads, target audience forms completed
- [ ] Screenshots and graphics uploaded; listing text pasted
- [ ] Production release created from a tested `.aab`; staged rollout 20% → 100%
- [ ] After launch: watch crashes (Play Console → Android vitals) and the Render logs for a week
