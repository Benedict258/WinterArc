# DEV_PLAN.md — Workspace Implementation Roadmap

---

## Phase 0: Project Setup & Infrastructure

**Duration:** ~4 hours
**Goal:** Bootstrap a working project with basic tooling and deployment ready

### Deliverables

- [ ] Git repo initialized (or cloned)
- [ ] Frontend scaffold: `npm create vite@latest workspace -- --template react-ts`
- [ ] Backend scaffold: `npm init -y` + Express server
- [ ] Environment files: `.env.example`, `.env.local` (gitignored)
- [ ] MongoDB Atlas cluster created, test connection from Node
- [ ] Google OAuth2 credentials created (console.cloud.google.com)
- [ ] Vercel or Render account configured, auto-deploy on git push enabled
- [ ] README.md with dev setup instructions
- [ ] TypeScript configuration (`tsconfig.json` for both frontend and backend)
- [ ] Development scripts: `npm run dev` (both), `npm run build`, `npm run start`

### Acceptance Criteria

- `npm run dev` starts frontend on localhost:5173 + backend on localhost:3000
- MongoDB connection string works
- No TypeScript errors on clean build

---

## Phase 1: Data Models & Mongoose Schemas

**Duration:** ~6 hours
**Goal:** Define MongoDB collections and core validation

### Deliverables

- [ ] Mongoose schemas created:
  - Thread (name, category, frequency, fixedDay, status, notes)
  - Task (title, threadId, date, timeBlock, status, completedAt, calendarEventId, source)
  - WishlistItem (item, note, acquired)
  - Goal (period, text)
  - CalendarSync (googleAccountId, accessToken, refreshToken, lastSyncedAt, expiresAt)
  - Settings (timezone, weeklyGenerationRules, multipleThreadsPerWeekTarget)
- [ ] Indexes created (date, threadId, status for queries)
- [ ] Validation rules added (enums, required fields, date constraints)
- [ ] Seed script: populate initial Threads from PRD section 7

### Acceptance Criteria

- All 6 collections exist in MongoDB Atlas test instance
- Seed script runs without errors
- Queries for tasks by date/threadId/status are fast

---

## Phase 2: Backend API Scaffolding

**Duration:** ~8 hours
**Goal:** Create REST endpoints for all data entities (CRUD only, no business logic yet)

### Deliverables

- [ ] Express server setup with error handling middleware
- [ ] Routes organized by feature:
  - `src/routes/threads.ts` — GET, POST, PUT, DELETE `/api/threads`
  - `src/routes/tasks.ts` — GET, POST, PUT, DELETE `/api/tasks`
  - `src/routes/wishlist.ts` — GET, POST, PUT, DELETE `/api/wishlist`
  - `src/routes/goals.ts` — GET, POST, PUT, DELETE `/api/goals`
  - `src/routes/settings.ts` — GET, PUT `/api/settings`
- [ ] Request validation via middleware (e.g., zod or joi)
- [ ] Response formatting (consistent JSON structure)
- [ ] Health check endpoint: `GET /api/health`
- [ ] CORS configured to allow frontend origin
- [ ] All routes tested manually with curl / Postman

### Acceptance Criteria

- All CRUD endpoints respond with 200/201/404/400 as appropriate
- Request body validation rejects invalid data with 400
- No unhandled promise rejections in logs

---

## Phase 3: Grid Generation Algorithm

**Duration:** ~6 hours
**Goal:** Implement the core auto-generation logic for weekly schedules

### Deliverables

- [ ] `src/services/gridService.ts` — core algorithm
  - `generateWeek(startDate, threads)` — places threads into week
  - `regenerateWeek(date)` — reset a week to auto-gen state
  - `handleThreadUpdate(threadId)` — re-run gen for future weeks
- [ ] Algorithm handles all frequency types:
  - `daily` — appears every day
  - `weekly` — appears once, on least-loaded day
  - `fixed-day` — appears on specified day
  - `multiple` — distributed ~3x/week
- [ ] Manual override handling: preserve source="manual" tasks
- [ ] API routes:
  - `GET /api/grid/week/:date` — fetch auto-generated grid for week
  - `POST /api/grid/regenerate?date=YYYY-MM-DD` — regenerate specific week
  - `POST /api/grid/regenerate?all=true` — regenerate all future weeks
- [ ] Unit tests for distribution logic (edge cases: all daily, all multiple, etc.)

### Acceptance Criteria

- Grid generation produces tasks for all active threads
- Manual edits survive regeneration
- No overlapping tasks on same day/block
- Tests cover all frequency types

---

## Phase 4: Google Calendar Integration (Backend)

**Duration:** ~8 hours
**Goal:** OAuth2 flow and calendar sync endpoints

### Deliverables

- [ ] `src/services/calendarService.ts`:
  - OAuth2 flow (auth URL generation, token exchange, refresh)
  - `pushTask(task)` — create/update calendar event
  - `pullEvents(date)` — fetch events from calendar
  - Token storage/refresh logic
- [ ] Routes:
  - `POST /api/calendar/auth` — return Google OAuth URL
  - `POST /api/calendar/callback` — handle OAuth callback, store tokens
  - `GET /api/calendar/events?date=YYYY-MM-DD` — fetch events
  - `POST /api/calendar/sync` — manual sync
  - `GET /api/calendar/status` — connection status
- [ ] Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- [ ] Error handling: expired tokens, network errors, malformed responses

### Acceptance Criteria

- OAuth2 flow completes successfully (test in browser)
- Tasks can be pushed to and pulled from Google Calendar
- Expired tokens are automatically refreshed
- Calendar events appear in backend pull response

---

## Phase 5: Frontend Layout & Navigation

**Duration:** ~6 hours
**Goal:** Basic UI structure and view switching (no data yet)

### Deliverables

- [ ] React app structure:
  - `App.tsx` — top-level router (no React Router; simple pathname-based switching)
  - `components/layouts/Header.tsx` — top nav, view buttons
  - `components/layouts/Sidebar.tsx` — view list + quick-add button
  - `components/views/TodayView.tsx` — layout only, no tasks yet
  - `components/views/WeekView.tsx` — layout only
  - `components/views/ThreadsView.tsx` — layout only
  - `components/views/BacklogView.tsx` — layout only
  - `components/views/WishlistView.tsx` — layout only
  - `components/views/GoalsView.tsx` — layout only
  - `components/views/SettingsView.tsx` — layout only
- [ ] CSS: Tailwind setup, basic component styling (no brand colors/typography yet)
- [ ] Navigation between views via buttons/links
- [ ] Responsive layout (mobile-first, tested on small screen)

### Acceptance Criteria

- Clicking nav buttons switches views
- Layout looks reasonable on mobile and desktop
- No data fetching yet; views are static/placeholder

---

## Phase 6: Task CRUD UI (Today & Backlog Views)

**Duration:** ~8 hours
**Goal:** Create, read, update, delete tasks in the UI

### Deliverables

- [ ] `hooks/useTasks.ts` — fetch tasks from `/api/tasks`, cache with state
- [ ] TodayView:
  - Display today's tasks grouped by time block (morning/afternoon/evening)
  - Checkbox to toggle task status (pending/done/skipped)
  - Edit task button → modal to change title, block
  - Delete task button
  - Visual indicator of task source (auto-gen vs manual)
- [ ] BacklogView:
  - List of unscheduled tasks (threadId=null, no date)
  - Drag-drop to assign to a specific day (moves to Today/Week view)
  - Edit/delete
- [ ] Quick-add component:
  - Input field (global, on every page)
  - Creates a one-time task with title only
  - Defaults to today, unscheduled block
  - Submit via Enter key or button
- [ ] API integration: POST /api/tasks, PUT /api/tasks/:id, DELETE /api/tasks/:id

### Acceptance Criteria

- Create a task via quick-add → appears in Today view
- Mark task done → completedAt is set, status updates
- Edit task title → persists to backend
- Delete task → removed from view and database
- No network errors on CRUD

---

## Phase 7: Thread Management UI

**Duration:** ~6 hours
**Goal:** Display and edit threads, trigger regeneration

### Deliverables

- [ ] `hooks/useThreads.ts` — fetch threads, manage CRUD
- [ ] ThreadsView:
  - List all threads, grouped by category
  - Filter by category/status
  - Create Thread modal:
    - name, category, frequency, fixedDay (if applicable), status, notes
  - Edit Thread modal (same fields)
  - Delete Thread (soft-delete/archive)
  - Visual indicator: how many times/week does this thread appear?
  - "Regenerate this week" button (calls `/api/grid/regenerate?date=...`)
- [ ] API integration: GET/POST/PUT/DELETE `/api/threads`

### Acceptance Criteria

- Create a new thread → appears in list
- Edit thread frequency → "regenerate this week" is available
- Click regenerate → week is re-built with new distribution
- Archiving a thread → it's hidden from active list, but analytics still show it

---

## Phase 8: Weekly Grid View

**Duration:** ~8 hours
**Goal:** Display auto-generated weekly schedule, support drag/drop

### Deliverables

- [ ] `hooks/useWeeklyGrid.ts` — fetch week data from `/api/grid/week/:date`
- [ ] WeekView:
  - 7 columns (Mon–Sun), 3 rows per column (morning/afternoon/evening)
  - Show all tasks for that day in each block
  - Drag-drop task between blocks (same day or different day)
  - Visual distinction: auto-gen (lighter) vs manual edit (darker)
  - "Reset this week" button (calls regenerate)
  - Week navigation (previous/next week)
- [ ] Drag-drop implementation: native HTML5 drag or react-dnd library
- [ ] Backend update: `PUT /api/tasks/:id` to change date/timeBlock

### Acceptance Criteria

- Grid displays all 7 days, 3 blocks each
- Dragging a task to a new block updates it
- Visual distinction between auto-gen and manual tasks
- Reset button clears manual edits and regenerates

---

## Phase 9: Goals & Analytics

**Duration:** ~6 hours
**Goal:** Display completion streaks and goal tracking

### Deliverables

- [ ] `hooks/useAnalytics.ts` — fetch analytics from `/api/analytics/*`
- [ ] GoalsView:
  - Text area for quarterly goals (save on blur, update via PUT `/api/goals`)
  - Analytics dashboard:
    - Daily completion streak (did you touch every daily-frequency thread today?)
    - Per-thread completion count (e.g., "8/10 ECAPs tasks this month")
    - Per-thread longest streak (e.g., "5-day streak on Python")
    - Monthly completion % chart (simple bar chart)
- [ ] Backend services:
  - `getThreadStats(threadId, period)` — completion count, streak
  - `getDailyStreak()` — consecutive days with all daily tasks touched
  - `getMonthlyRollup()` — completion % per day/week

### Acceptance Criteria

- Analytics display without lagging
- Completing a task updates streak in real-time
- Goals are persisted across sessions
- Monthly chart shows accurate data

---

## Phase 10: Wishlist View

**Duration:** ~3 hours
**Goal:** Simple wishlist checklist

### Deliverables

- [ ] WishlistView:
  - List of wishlist items
  - Checkbox to toggle "acquired" status
  - Add item button → inline input
  - Delete item button
- [ ] API integration: GET/POST/PUT/DELETE `/api/wishlist`

### Acceptance Criteria

- Add item → appears in list
- Check item → acquired=true, visual indication (strikethrough/dimmed)
- Delete item → removed
- Persists across sessions

---

## Phase 11: Settings & Data Management

**Duration:** ~4 hours
**Goal:** Calendar connection, data export/import, timezone

### Deliverables

- [ ] SettingsView:
  - Google Calendar connection:
    - "Connect to Google Calendar" button (redirects to OAuth)
    - Display connection status (connected/disconnected, email)
    - "Disconnect" button
    - "Sync now" button (manually pull/push calendar)
  - Timezone selector
  - Data export button (downloads JSON dump of all collections)
  - Data import button (upload JSON to restore)
  - "Reset weekly generation" controls (per day/week)
- [ ] Frontend:
  - OAuth callback handler: detect callback URL, store token in localStorage
  - Sync trigger: manual button calls `/api/calendar/sync`

### Acceptance Criteria

- OAuth flow completes, token is stored
- Calendar events appear in day views after sync
- Export creates valid JSON
- Import restores data correctly

---

## Phase 12: Offline Support & PWA

**Duration:** ~6 hours
**Goal:** Service worker, IndexedDB, sync queue

### Deliverables

- [ ] `vite-plugin-pwa` configuration:
  - Precache: app shell + critical routes
  - Network-first for `/api/*`
  - Cache-first for static assets
- [ ] IndexedDB cache:
  - `lib/storage.ts` — functions to read/write threads, tasks, goals to IndexedDB
  - Cache current week's tasks on every view
- [ ] Offline sync queue:
  - Store mutations (creates/updates/deletes) in IndexedDB queue when offline
  - When online, flush queue via HTTP
  - Track sync status (pending, retrying, synced)
- [ ] Manifest: `public/manifest.json` with app name, icons, start_url, display
- [ ] Install button: detect PWA install prompt, offer "Install" to user

### Acceptance Criteria

- Close dev server, app still works (offline mode)
- Create task offline → appears in list
- When online, task syncs to backend
- App can be installed on mobile (Add to Home Screen)

---

## Phase 13: Testing & Bug Fixes

**Duration:** ~8 hours
**Goal:** Unit tests, integration tests, manual QA

### Deliverables

- [ ] Unit tests:
  - Grid algorithm (vitest or jest)
  - Analytics calculations
  - Date utilities
- [ ] Integration tests:
  - Create thread → grid regenerates correctly
  - Create task → appears in day views
  - Mark task done → streak updates
- [ ] Manual QA:
  - End-to-end flow: create thread, create task, complete, check analytics
  - Mobile responsiveness
  - Offline/online transitions
  - Browser compatibility (Chrome, Safari, Firefox)
- [ ] Bug filing & fixes:
  - Build warnings (TypeScript, ESLint)
  - Console errors/warnings
  - Performance issues (Lighthouse audit)

### Acceptance Criteria

- 80%+ test coverage on services
- No TypeScript errors
- Lighthouse score ≥ 80 on mobile
- Manual QA checklist passes

---

## Phase 14: Deployment & Production Hardening

**Duration:** ~4 hours
**Goal:** Deploy to production, monitor, configure

### Deliverables

- [ ] Environment setup:
  - Production MongoDB cluster (Atlas)
  - Vercel/Railway deployment (frontend + backend)
  - Google OAuth2 production credentials
- [ ] Production configuration:
  - Environment variables for prod (API URL, Google Client ID, etc.)
  - HTTPS enforcement (automatic via Vercel/Railway)
  - CORS allow list (frontend domain only)
  - Rate limiting on API endpoints
- [ ] Monitoring:
  - Error logging (e.g., Sentry or simple file logging)
  - Performance monitoring (e.g., Vercel Analytics)
- [ ] Documentation:
  - User guide: how to use Workspace daily
  - Admin guide: how to backup data, troubleshoot

### Acceptance Criteria

- Production deployment is live at `workspace.benedictisaac.dev`
- HTTPS works (no mixed content warnings)
- Errors are logged and visible
- Backup strategy documented

---

## Phase 15: Post-Launch & Iteration (v1.1+)

**Duration:** TBD
**Goal:** Gather feedback, iterate on UX

### Potential improvements (not guaranteed for v1)

- [ ] Lightweight passcode auth
- [ ] UI polish & brand design
- [ ] Performance optimization (bundle size, load time)
- [ ] Monthly/yearly data rollups
- [ ] Dark mode
- [ ] Keyboard shortcuts
- [ ] Advanced filtering (saved filters on backlog)
- [ ] Recurring task support (e.g., daily task from a thread that repeats)

---

## Summary Table

| Phase | Feature         | Duration | Blocker     | Status      |
| ----- | --------------- | -------- | ----------- | ----------- |
| 0     | Setup           | 4h       | —           | Not started |
| 1     | Data models     | 6h       | Phase 0     | Not started |
| 2     | Backend CRUD    | 8h       | Phase 1     | Not started |
| 3     | Grid algorithm  | 6h       | Phase 1     | Not started |
| 4     | Google Calendar | 8h       | Phase 2     | Not started |
| 5     | Frontend layout | 6h       | Phase 0     | Not started |
| 6     | Task CRUD       | 8h       | Phases 2, 5 | Not started |
| 7     | Thread UI       | 6h       | Phases 2, 5 | Not started |
| 8     | Weekly grid UI  | 8h       | Phases 3, 5 | Not started |
| 9     | Analytics       | 6h       | Phases 2, 5 | Not started |
| 10    | Wishlist        | 3h       | Phases 2, 5 | Not started |
| 11    | Settings        | 4h       | Phases 4, 5 | Not started |
| 12    | PWA/offline     | 6h       | Phases 2, 5 | Not started |
| 13    | Testing         | 8h       | All prior   | Not started |
| 14    | Deployment      | 4h       | Phase 13    | Not started |
| 15    | Iteration       | TBD      | Phase 14    | Not started |

**Total estimated time:** ~94 hours (~12 working days)
