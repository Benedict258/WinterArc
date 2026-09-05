# ARCHITECTURE.md — Workspace System Design

---

## 1. System Overview

Workspace is a full-stack PWA with:

- **Frontend:** Vite + React SPA, installable on mobile/desktop
- **Backend:** Node.js + Express REST API
- **Database:** MongoDB Atlas (single-user document store)
- **External Services:** Google Calendar API (OAuth2), local storage for offline caching
- **Hosting:** Vercel (frontend) or Render/Railway (full stack)

The system is designed around **one user** and **minimal operational complexity**. No auth system beyond optional passcode for v1.

---

## 2. Data Model & Collections

### 2.1 Threads Collection

```javascript
{
  _id: ObjectId,
  name: String,                          // "ECAPs R&D", "AWS Builder Group Technical Lead"
  category: String,                      // "Role/Program" | "Active Build" | "Learning Track" | "Application/Outreach" | "Other"
  frequency: String,                     // "daily" | "multiple" | "weekly" | "fixed-day"
  fixedDay: Number (0-6),                // day of week (0=Mon, 6=Sun), used only if frequency = "fixed-day"
  status: String,                        // "active" | "parked" | "archived"
  notes: String,                         // optional free text
  createdAt: Date,
  updatedAt: Date
}
```

### 2.2 Tasks Collection

```javascript
{
  _id: ObjectId,
  title: String,                         // task description
  threadId: ObjectId (nullable),         // null for one-time tasks
  date: Date,                            // scheduled date
  timeBlock: String,                     // "morning" | "afternoon" | "evening" | "unscheduled"
  status: String,                        // "pending" | "done" | "skipped"
  completedAt: Date (nullable),
  calendarEventId: String (nullable),    // Google Calendar event ID if synced
  source: String,                        // "manual" | "auto-generated" | "google-calendar"
  createdAt: Date,
  updatedAt: Date
}
```

### 2.3 WishlistItems Collection

```javascript
{
  _id: ObjectId,
  item: String,                          // item name
  note: String (optional),               // optional description
  acquired: Boolean,                     // false by default, true when purchased
  createdAt: Date,
  updatedAt: Date
}
```

### 2.4 Goals Collection

```javascript
{
  _id: ObjectId,
  period: String,                        // "Q4-2026", "2026-Q1", period identifier
  text: String,                          // goal description
  createdAt: Date,
  updatedAt: Date
}
```

### 2.5 CalendarSync Collection

```javascript
{
  _id: ObjectId,
  googleAccountId: String,               // user's Google account ID
  accessToken: String,                   // OAuth2 access token
  refreshToken: String,                  // OAuth2 refresh token
  lastSyncedAt: Date,                    // last calendar sync timestamp
  expiresAt: Date,                       // token expiry
  createdAt: Date,
  updatedAt: Date
}
```

### 2.6 Settings Collection

```javascript
{
  _id: ObjectId,
  timezone: String,                      // user timezone (e.g., "Africa/Lagos")
  weeklyGenerationRules: Object,         // optional overrides to auto-gen algorithm
  multipleThreadsPerWeekTarget: Number,  // default ~3, customizable per thread
  createdAt: Date,
  updatedAt: Date
}
```

---

## 3. Frontend Architecture (Vite + React)

### 3.1 Directory Structure

```
src/
  components/
    views/
      TodayView.tsx        # Today's tasks by time block
      WeekView.tsx         # Mon–Sun grid
      ThreadsView.tsx      # Thread list + CRUD
      BacklogView.tsx      # Unscheduled one-time tasks
      WishlistView.tsx     # Wishlist checklist
      GoalsView.tsx        # Goals + analytics dashboard
      SettingsView.tsx     # Calendar connection, data export

    common/
      Header.tsx           # Top nav, quick-add button
      Sidebar.tsx          # View navigation
      TaskCard.tsx         # Task component (reusable)
      ThreadCard.tsx       # Thread component
      QuickAdd.tsx         # Global quick-add modal

  hooks/
    useThreads.ts         # Thread CRUD + fetch
    useTasks.ts           # Task CRUD + fetch
    useWeeklyGrid.ts      # Grid generation + regeneration
    useGoogleCalendar.ts  # Calendar sync logic
    useOfflineSync.ts     # Service worker + sync queue
    useAnalytics.ts       # Completion analytics

  lib/
    api.ts                # API client (fetch wrapper)
    storage.ts            # IndexedDB / localStorage helpers
    utils.ts              # date, formatting, grid logic

  App.tsx                 # Root, routing (no router library in v1)
  index.css               # Tailwind + global styles
```

### 3.2 State Management

- **Local state:** React `useState` within components
- **Server state:** TanStack Query or simple custom hooks with refetch
- **Offline cache:** IndexedDB (via idb library) for week's task/thread data
- **Component composition:** Small, focused components with lifted state where needed

### 3.3 Key Components

**TodayView**

- Displays Morning/Afternoon/Evening blocks for current date
- Shows Thread-generated tasks + one-time tasks
- Checkbox for task completion
- Quick-add button always visible
- Drag-drop or double-tap to move task to different block

**WeekView**

- 7-column grid (Mon–Sun)
- Each cell shows 3 time blocks
- Displays all tasks for that day
- Drag-drop between blocks/days
- Visual indication of auto-generated vs manual tasks

**ThreadsView**

- List of all Threads, filterable by category/status
- Create Thread button
- Edit Thread modal (name, category, frequency, fixedDay, status, notes)
- Delete Thread (soft-delete/archive)
- Visual indicator of Thread contribution to week

**BacklogView**

- List of all one-time tasks where `threadId = null` and not scheduled
- Drag-drop to assign to a specific day/block
- Inline edit of task details
- Quick-add entry point

**GoalsView**

- Text area to edit quarterly goals
- Analytics panel showing:
  - Per-Thread task count/streak
  - Daily completion streak
  - Weekly/monthly rollup charts

---

## 4. Backend Architecture (Node.js + Express)

### 4.1 API Routes

#### Thread Management

- `GET /api/threads` — list all threads
- `POST /api/threads` — create thread
- `PUT /api/threads/:id` — update thread (name, category, frequency, status, notes)
- `DELETE /api/threads/:id` — soft-delete/archive
- `GET /api/threads/:id` — get single thread

#### Task Management

- `GET /api/tasks` — list tasks (optional query: ?date=YYYY-MM-DD, ?status=pending, ?threadId=X)
- `POST /api/tasks` — create task
- `PUT /api/tasks/:id` — update task (title, threadId, date, timeBlock, status)
- `DELETE /api/tasks/:id` — delete task
- `PATCH /api/tasks/:id/complete` — mark done + set completedAt
- `GET /api/tasks/week/:date` — get all tasks for the week starting this date

#### Weekly Grid Generation

- `GET /api/grid/week/:date` — fetch auto-generated grid for week starting this date (combines Threads + existing Tasks)
- `POST /api/grid/regenerate` — force regenerate a specific week (reset to auto-gen state)
- `POST /api/grid/regenerate?all=true` — regenerate all future weeks from today

#### Wishlist

- `GET /api/wishlist` — list all items
- `POST /api/wishlist` — create item
- `PUT /api/wishlist/:id` — update (item, note, acquired)
- `DELETE /api/wishlist/:id` — delete

#### Goals & Analytics

- `GET /api/goals` — list all goals
- `POST /api/goals` — create goal
- `PUT /api/goals/:id` — update goal
- `DELETE /api/goals/:id` — delete goal
- `GET /api/analytics/thread/:threadId` — completion stats for one thread
- `GET /api/analytics/streak` — daily completion streak
- `GET /api/analytics/monthly` — monthly rollup

#### Settings

- `GET /api/settings` — get user settings
- `PUT /api/settings` — update timezone, generation rules
- `POST /api/settings/export` — export all data as JSON
- `POST /api/settings/import` — import data from JSON

#### Google Calendar

- `POST /api/calendar/auth` — initiate OAuth2 flow (returns redirect URL)
- `POST /api/calendar/callback` — OAuth2 callback (store tokens)
- `GET /api/calendar/events?date=YYYY-MM-DD` — fetch events from calendar for a date
- `POST /api/calendar/sync` — manual sync
- `GET /api/calendar/status` — connection status

### 4.2 Directory Structure

```
server/
  routes/
    threads.ts          # Thread endpoints
    tasks.ts            # Task endpoints
    grid.ts             # Weekly grid endpoints
    wishlist.ts         # Wishlist endpoints
    goals.ts            # Goals endpoints
    analytics.ts        # Analytics endpoints
    settings.ts         # Settings endpoints
    calendar.ts         # Google Calendar endpoints

  services/
    threadService.ts    # Thread logic (CRUD, validation)
    taskService.ts      # Task logic (CRUD, validation, completion)
    gridService.ts      # Grid generation algorithm, regeneration
    wishlistService.ts  # Wishlist logic
    goalsService.ts     # Goals logic
    analyticsService.ts # Streak/rollup calculations
    settingsService.ts  # Settings CRUD
    calendarService.ts  # Google Calendar API calls, sync logic

  middleware/
    auth.ts             # Optional passcode middleware
    errorHandler.ts     # Global error handling
    logging.ts          # Request/response logging

  models/
    Thread.ts           # Mongoose schema + model
    Task.ts
    WishlistItem.ts
    Goal.ts
    CalendarSync.ts
    Settings.ts

  utils/
    dateHelpers.ts      # Date utilities
    gridAlgorithm.ts    # Grid generation logic
    calendarHelpers.ts  # Calendar sync helpers

  index.ts              # Express app setup
  database.ts           # MongoDB connection
```

### 4.3 Core Services

**GridService**

- `generateWeek(startDate, threads)` — algorithm to place thread tasks
  - Fixed-day threads placed on their day
  - Daily threads generate 7 tasks (one per day)
  - Weekly threads generate 1 task, distributed to least-loaded day
  - Multiple threads distributed ~3x/week
- `regenerateWeek(date)` — reset a week to auto-generated state
- `getWeek(date)` — fetch existing + auto-generated tasks for week
- `handleThreadUpdate(threadId)` — re-run generation for future weeks when thread changes

**TaskService**

- CRUD operations on tasks
- Mark complete: set status="done", completedAt=now, sync to calendar
- Mark skipped: set status="skipped"
- Handle calendar sync: update calendarEventId after push to Google Calendar
- Validate: task date must be valid, threadId must exist if not null

**AnalyticsService**

- `getThreadStats(threadId, period)` — count completed tasks, streak
- `getDailyStreak()` — consecutive days where all daily-frequency threads have at least one completed task
- `getMonthlyRollup(month)` — completion percentage by week/day

**CalendarService**

- OAuth2 flow: get auth URL, exchange code for tokens, refresh expired tokens
- `pushTask(task)` — create/update Google Calendar event from task
- `pullEvents(date)` — fetch events from Google Calendar for a specific date
- Sync conflict: last-write-wins (server state overrides calendar if both changed)

---

## 5. Weekly Grid Auto-Generation Algorithm

### 5.1 Pseudocode

```
function generateWeek(startDate, threads, existingTasks):
  weekTasks = []

  // 1. Place fixed-day threads
  for thread in threads where thread.frequency == "fixed-day":
    day = startDate + thread.fixedDay
    task = createTask(title=thread.name, threadId=thread.id, date=day,
                      source="auto-generated")
    weekTasks.push(task)

  // 2. Place daily threads
  for thread in threads where thread.frequency == "daily":
    for day in Mon...Sun:
      task = createTask(title=thread.name, threadId=thread.id, date=day,
                        source="auto-generated")
      weekTasks.push(task)

  // 3. Place weekly threads (distribute to least-loaded day)
  weeklyThreads = threads where frequency == "weekly"
  days = Mon...Sun  // sorted by existing task count (ascending)
  for thread in weeklyThreads:
    leastLoadedDay = days.minBy(taskCount)
    task = createTask(title=thread.name, threadId=thread.id,
                      date=leastLoadedDay, source="auto-generated")
    weekTasks.push(task)

  // 4. Place multiple threads (~3x/week, distributed)
  multipleThreads = threads where frequency == "multiple"
  slots = distribute(multipleThreads, 3 * multipleThreads.length)  // rough 3x/week
  for slot in slots:
    day = slot.day
    task = createTask(title=multipleThreads[slot.threadIndex].name, ...)
    weekTasks.push(task)

  // 5. Merge with existing manually-edited tasks (do not overwrite them)
  result = existingTasks + weekTasks  // existing kept, new auto-gen added
  return result
```

### 5.2 Manual Override Handling

- A task has `source` field: "auto-generated" vs "manual"
- When regenerating, only **overwrite tasks with source="auto-generated"**
- User-edited tasks (source="manual") are preserved
- If user edits an auto-generated task, set source="manual"

---

## 6. Google Calendar Integration

### 6.1 OAuth2 Flow

1. User clicks "Connect Google Calendar" in Settings
2. Frontend redirects to backend `/api/calendar/auth` which returns Google OAuth URL
3. User authenticates with Google
4. Google redirects back to callback endpoint with auth code
5. Backend exchanges code for tokens, stores in calendarSync collection
6. Frontend redirected to success page

### 6.2 Two-Way Sync

**Push (Workspace → Google Calendar)**

- When a task is created/updated in Workspace, create/update a Google Calendar event
- Event time = task's date + timeBlock converted to actual time (e.g., morning = 9am)
- Store Google Calendar event ID in task.calendarEventId
- When task is marked done/deleted, update/delete calendar event

**Pull (Google Calendar → Workspace)**

- Periodically (or on-demand in Settings), fetch all calendar events for the week
- Display calendar events in the day view under an "Events" section (read-only context)
- User can optionally "Import" a calendar event as a Task (creates a manual task linked to that event)

**Sync Conflict**

- Workspace is source of truth (last-write-wins)
- If both Workspace and Google Calendar are edited, Workspace state overwrites

---

## 7. Offline & PWA Support

### 7.1 Service Worker

- Installed via `vite-plugin-pwa`
- Precaches: app shell (HTML, CSS, JS), critical routes
- Network-first for `/api/*` (fallback to cache)
- Cache-first for static assets (fonts, images, icons)

### 7.2 IndexedDB Caching

- Current week's Threads, Tasks, Goals cached locally
- Sync queue: when offline, queue task creates/updates/deletes
- When online: flush sync queue via HTTP

### 7.3 Offline Capabilities

- Read: view Today, Week, Threads, Backlog (all cached)
- Write: create/edit/complete tasks, create quick-add tasks (queued)
- Limitations: cannot sync to Google Calendar offline; Calendar push/pull only work online

---

## 8. Security & Auth

### 8.1 v1: No Auth System

- Single-user app. Publicly hosted, but intended only for Benedict.
- **Optional lightweight passcode:** simple pre-shared key in env var checked against request header.

### 8.2 External Auth: Google OAuth2

- Google Calendar connection stores tokens in MongoDB
- Tokens encrypted at rest (optional: bcryptjs in production)
- Refresh token used to get fresh access tokens if expired

### 8.3 Production Considerations

- HTTPS only (enforced by hosting platform)
- CORS: allow only frontend domain
- Rate limiting: basic rate limit on `/api/*` endpoints
- Input validation: validate all inputs server-side (dates, strings, enums)

---

## 9. Deployment Architecture

### Option A: Vercel (Recommended for v1)

- Frontend: Vercel SPA (static hosting)
- Backend: Vercel Serverless Functions
- Database: MongoDB Atlas (cloud)
- Pros: simple, automatic deploys on git push, free tier
- Cons: cold starts on serverless functions, slightly higher latency

### Option B: Render/Railway (Full Stack)

- Frontend + Backend: single Node.js app on Render/Railway
- Database: MongoDB Atlas (cloud)
- Pros: persistent connection, lower latency, simpler backend
- Cons: needs to manage a running service, costs more than Vercel

**Current Decision:** _Pending confirmation from Benedict_

---

## 10. Development Phases

See DEV_PLAN.md for detailed phase breakdown.
