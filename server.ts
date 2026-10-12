import express from 'express'
import cors from 'cors'
import path from 'path'
import crypto from 'crypto'
import mongoose from 'mongoose'
import session from 'express-session'
import { MongoStore } from 'connect-mongo'

import { Thread } from './backend/src/models/Thread.ts'
import { quarterRange, computeStreak, completionStats } from './backend/src/services/analyticsService.ts'
import { PushSubscription } from './backend/src/models/PushSubscription.ts'
import { pushConfigured, vapidPublicKey, sendToUser, runNotificationTick, startNotificationScheduler, markNotificationsDirty } from './backend/src/services/notificationService.ts'
import { validUnsubscribe } from './backend/src/services/emailService.ts'
import {
  calendarConfigured,
  getAuthUrl,
  verifyState,
  handleCallback as calendarHandleCallback,
  disconnect as calendarDisconnect,
  syncCalendar,
  eventsForDay,
  deleteRemoteEvent,
  syncAllStale,
} from './backend/src/services/calendarService.ts'
import { createIdempotent } from './backend/src/utils/idempotentCreate.ts'
import { Task } from './backend/src/models/Task.ts'
import { WishlistItem } from './backend/src/models/WishlistItem.ts'
import { Goal } from './backend/src/models/Goal.ts'
import { Settings } from './backend/src/models/Settings.ts'
import { CalendarSync } from './backend/src/models/CalendarSync.ts'
import { DropItem } from './backend/src/models/DropItem.ts'
import { getPresignedPutUrl, getPresignedGetUrl, deleteS3Object, isStorageConfigured, StorageNotConfiguredError } from './backend/src/services/s3.ts'
import { v4 as uuidv4 } from 'uuid'

import * as threadService from './backend/src/services/threadService.ts'
import * as taskService from './backend/src/services/taskService.ts'
import * as gridService from './backend/src/services/gridService.ts'
import { applyOnboarding, AlreadyOnboardedError } from './backend/src/services/onboardingService.ts'
import { TEMPLATES, PRESETS } from './src/shared/templates.ts'
import { ensureTodayGenerated, generateForActiveUsers, rebalanceWeek, toDayKey, DEFAULT_TIMEZONE } from './backend/src/services/dailyGenerationService.ts'
import { validateRequest } from './backend/src/middleware/validationMiddleware.ts'
import { authenticate, requireAuth, requireVerified, uid } from './backend/src/middleware/auth.ts'
import { authRouter } from './backend/src/routes/auth.ts'
import {
  threadSchema,
  threadUpdateSchema,
  threadResourceSchema,
  taskSchema,
  taskUpdateSchema,
  wishlistItemSchema,
  wishlistItemUpdateSchema,
  goalSchema,
  goalUpdateSchema,
  settingsUpdateSchema,
  onboardingSchema,
  gridBalancingUpdateSchema,
  dropUploadUrlSchema,
  dropItemSchema,
  dropUpdateSchema,
  pushSubscriptionSchema,
} from './backend/src/utils/validation.ts'

// Load .env (dev convenience — works without dotenv dependency)
import { readFileSync, existsSync } from 'fs'
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    // Real environment variables (PM2, shell) win over .env
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadEnv()

const PORT = Number(process.env.PORT) || 3000
const IS_PROD = process.env.NODE_ENV === 'production'
const IS_TEST = process.env.NODE_ENV === 'test'

if (IS_PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error('ERROR: SESSION_SECRET (32+ chars) is required in production.')
  process.exit(1)
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')

async function getTimezone(userId: string) {
  const settings = await Settings.findOne({ userId })
  return settings?.timezone || DEFAULT_TIMEZONE
}

/** Number of proxy hops in front of the app (Render = 1; Vercel → Render = 2). */
function trustProxySetting() {
  const raw = process.env.TRUST_PROXY
  if (!raw) return 1
  if (/^\d+$/.test(raw)) return Number(raw)
  return raw === 'true' ? true : raw
}

// The native app's WebView origins (Capacitor). It authenticates with a bearer
// token, not cookies, so allowing these origins doesn't expose cookie sessions.
const NATIVE_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost']

const ALLOWED_ORIGINS = [
  ...(process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  ...NATIVE_ORIGINS,
]

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function storageErrorStatus(error: unknown) {
  return error instanceof StorageNotConfiguredError ? 503 : 500
}

/** Paths under /api that work without being logged in. */
const PUBLIC_PATHS = new Set(['/health', '/cron/tick', '/calendar/callback', '/email/unsubscribe'])

/**
 * Builds the Express app (API only). Needs an open Mongoose connection.
 * Kept separate from startServer() so tests can run the real app against a test database.
 */
export function createApp() {
  const app = express()
  app.set('trust proxy', trustProxySetting())
  app.disable('x-powered-by')

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    next()
  })

  // The frontend normally calls /api through a same-origin proxy (Vercel
  // rewrite), so CORS only matters if it's pointed straight at this server.
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use(session({
    name: 'winterarc.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // Persist sessions in Mongo so a restart doesn't log everyone out (tests use the in-memory store)
    store: (IS_TEST || process.env.SESSION_STORE === 'memory') ? undefined : MongoStore.create({
      client: mongoose.connection.getClient() as any,
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 30,
    }),
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  }))

  // Who is calling? (session cookie or bearer token) — sets req.user
  app.use('/api', authenticate)

  // ============================================
  // AUTH (sign-up, login, verify, reset, Google)
  // ============================================
  app.use('/api/auth', authRouter)

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get('/api/health', (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1
    res.status(mongoConnected ? 200 : 503).json({
      status: mongoConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      mongoConnected,
    })
  })

  // Keep-alive + scheduler tick for an external pinger (e.g. cron-job.org) on free hosting.
  // Authenticated by a shared secret so it can run without a session.
  app.get('/api/cron/tick', async (req, res) => {
    const secret = process.env.CRON_SECRET
    const given = typeof req.query.key === 'string' ? req.query.key : ''
    // Hash both sides first so the comparison is constant-time and length-independent
    const digest = (v: string) => crypto.createHash('sha256').update(v).digest()
    const ok = !!secret && crypto.timingSafeEqual(digest(given), digest(secret))
    if (!ok) return res.status(401).json({ error: 'Unauthorized' })
    try {
      const calendar = await syncAllStale().catch(err => { console.error('Calendar sync failed:', errorMessage(err)); return null })
      res.json({ ...(await runNotificationTick()), calendar })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // One-click stop for the daily email (linked from every digest); the signature proves the link came from us
  const unsubscribeDigest: express.RequestHandler = async (req, res) => {
    const userId = String(req.query.u ?? '')
    const signature = String(req.query.s ?? '')
    if (!/^[0-9a-f]{24}$/.test(userId) || !validUnsubscribe(userId, signature)) {
      return res.status(400).type('html').send('<p style="font-family:system-ui;padding:24px">This link isn\'t valid. You can switch the daily email off in Settings.</p>')
    }
    await Settings.updateOne({ userId }, { $set: { 'notifications.emailDigest.enabled': false } })
    res.type('html').send('<p style="font-family:system-ui;padding:24px">Done. You won\'t get the daily email any more. You can turn it back on in Settings.</p>')
  }
  app.get('/api/email/unsubscribe', unsubscribeDigest)
  app.post('/api/email/unsubscribe', unsubscribeDigest)

  // Everything below needs a logged-in, active user
  app.use('/api', (req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) return next()
    return requireAuth(req, res, next)
  })

  // Lazily commit today's schedule the first time anything asks for tasks
  const withToday = async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    try {
      await ensureTodayGenerated(uid(req))
    } catch (err) {
      console.error('Daily generation failed:', errorMessage(err))
    }
    next()
  }

  // ============================================
  // THREAD ENDPOINTS
  // ============================================
  app.get('/api/threads', async (req, res) => {
    try {
      const threads = await threadService.getThreads(uid(req))
      res.json(threads)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/threads', validateRequest(threadSchema), async (req, res) => {
    try {
      const thread = await threadService.createThread(uid(req), req.body)
      res.status(201).json(thread)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/threads/:id', validateRequest(threadUpdateSchema), async (req, res) => {
    try {
      const thread = await threadService.updateThread(uid(req), req.params.id, req.body)
      if (!thread) return res.status(404).json({ error: 'Thread not found' })
      res.json(thread)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/threads/:id', async (req, res) => {
    try {
      const result = await threadService.deleteThread(uid(req), req.params.id)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/threads/:id/stats', async (req, res) => {
    try {
      const { id } = req.params
      const thread = await Thread.findOne({ _id: id, userId: uid(req) })
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' })
        return
      }

      const timezone = await getTimezone(uid(req))
      const now = new Date()
      const { start: quarterStart, end: quarterEnd } = quarterRange(now, timezone)

      const tasks = await Task.find({ userId: uid(req), threadId: id })
      const quarterTasks = tasks.filter(t => {
        if (!t.date) return false
        const d = new Date(t.date)
        return d >= quarterStart && d <= quarterEnd
      })
      const quarter = completionStats(quarterTasks)
      const allDone = tasks.filter(t => t.status === 'done').length

      const streak = computeStreak(tasks.filter(t => t.status === 'done').map(t => t.completedAt), timezone)

      const lastActivity = tasks
        .filter(t => t.completedAt)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]?.completedAt || null

      const todayKey = toDayKey(now, timezone)
      const upcomingTasks = tasks
        .filter(t => t.status === 'pending' && t.date && new Date(t.date).toISOString().slice(0, 10) >= todayKey)
        .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
        .slice(0, 5)
        .map(t => ({
          _id: t._id,
          title: t.title,
          date: t.date,
          timeBlock: t.timeBlock,
          status: t.status,
        }))

      res.json({
        tasksThisQuarter: quarter,
        tasksAllTime: { total: tasks.length, completed: allDone },
        streakDays: streak,
        lastActivity,
        upcomingTasks,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/threads/:id/resources', validateRequest(threadResourceSchema), async (req, res) => {
    try {
      const { _id, title, url, description, kind } = req.body
      const resource = { ...(_id ? { _id } : {}), title, url, description: description || '', kind: kind === 'resource' ? 'resource' : 'link' }
      // One atomic update: a replayed add (same _id) matches nothing and is a no-op
      const result = await Thread.updateOne(
        { _id: req.params.id, userId: uid(req), ...(_id ? { 'resources._id': { $ne: _id } } : {}) },
        { $push: { resources: resource } }
      )
      const thread = await Thread.findOne({ _id: req.params.id, userId: uid(req) })
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' })
        return
      }
      const saved = _id ? thread.resources.find(r => String(r._id) === _id) : thread.resources[thread.resources.length - 1]
      res.status(result.modifiedCount ? 201 : 200).json(saved)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/threads/:id/resources/:resourceId', async (req, res) => {
    try {
      const thread = await Thread.findOne({ _id: req.params.id, userId: uid(req) })
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' })
        return
      }
      thread.resources = thread.resources.filter(r => String(r._id) !== req.params.resourceId) as any
      await thread.save()
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // TASK ENDPOINTS
  // ============================================
  app.get('/api/tasks', withToday, async (req, res) => {
    try {
      // Coerce to strings so query operators like ?status[$ne]=x can't reach Mongo
      const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
      const filters: any = {}
      const date = str(req.query.date)
      if (date) {
        if (!DAY_KEY_RE.test(date.slice(0, 10))) return res.status(400).json({ error: 'Invalid date' })
        filters.date = date
      }
      for (const key of ['before', 'since'] as const) {
        const value = str(req.query[key])
        if (!value) continue
        if (!DAY_KEY_RE.test(value.slice(0, 10))) return res.status(400).json({ error: `Invalid ${key}` })
        filters[key] = value
      }
      if (str(req.query.status)) filters.status = str(req.query.status)
      if (str(req.query.threadId) !== undefined) filters.threadId = str(req.query.threadId)
      const tasks = await taskService.getTasks(uid(req), filters)
      res.json(tasks)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/tasks', validateRequest(taskSchema), async (req, res) => {
    try {
      const task = await taskService.createTask(uid(req), req.body)
      res.status(201).json(task)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/tasks/:id', validateRequest(taskUpdateSchema), async (req, res) => {
    try {
      const task = await taskService.updateTask(uid(req), req.params.id, req.body)
      if (!task) return res.status(404).json({ error: 'Task not found' })
      res.json(task)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.patch('/api/tasks/:id/complete', async (req, res) => {
    try {
      const task = await taskService.completeTask(uid(req), req.params.id)
      if (!task) return res.status(404).json({ error: 'Task not found' })
      res.json(task)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const result = await taskService.deleteTask(uid(req), req.params.id)
      // An event we pushed to Google goes away there too (imported ones are left alone, or they'd just re-import)
      if (result?.calendarEventId && result.source !== 'google-calendar') void deleteRemoteEvent(uid(req), result.calendarEventId)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // GRID ENDPOINTS
  // ============================================
  app.get('/api/grid/week/:date', withToday, async (req, res) => {
    try {
      if (!DAY_KEY_RE.test(req.params.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' })
      const { weekStart, tasks, forecast } = await gridService.getWeek(uid(req), req.params.date)
      res.json({
        weekStart,
        week: tasks.map((t: any) => ({
          _id: t._id,
          title: t.title,
          threadId: t.threadId,
          date: t.date,
          dueDate: t.dueDate,
          timeBlock: t.timeBlock,
          status: t.status,
          source: t.source,
          priority: t.priority,
          intensity: t.intensity,
          isEvent: t.isEvent,
          startTime: t.startTime,
          endTime: t.endTime,
        })),
        forecast,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/grid/rebalance', async (req, res) => {
    try {
      const result = await rebalanceWeek(uid(req))
      await markNotificationsDirty(uid(req))
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/grid/settings', async (req, res) => {
    try {
      const balancing = await gridService.getGridSettings(uid(req))
      res.json(balancing)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/grid/settings', validateRequest(gridBalancingUpdateSchema), async (req, res) => {
    try {
      const balancing = await gridService.updateGridSettings(uid(req), req.body)
      res.json(balancing)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // WISHLIST ENDPOINTS
  // ============================================
  app.get('/api/wishlist', async (req, res) => {
    try {
      const items = await WishlistItem.find({ userId: uid(req) }).sort({ acquired: 1, createdAt: -1 })
      res.json(items)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/wishlist', validateRequest(wishlistItemSchema), async (req, res) => {
    try {
      const item = await createIdempotent(WishlistItem, uid(req), req.body)
      res.status(201).json(item)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/wishlist/:id', validateRequest(wishlistItemUpdateSchema), async (req, res) => {
    try {
      const item = await WishlistItem.findOneAndUpdate({ _id: req.params.id, userId: uid(req) }, req.body, { new: true, runValidators: true })
      if (!item) return res.status(404).json({ error: 'Not found' })
      res.json(item)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/wishlist/:id', async (req, res) => {
    try {
      await WishlistItem.findOneAndDelete({ _id: req.params.id, userId: uid(req) })
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // GOALS ENDPOINTS
  // ============================================
  app.get('/api/goals', async (req, res) => {
    try {
      const goals = await Goal.find({ userId: uid(req) }).sort({ period: -1, createdAt: -1 })
      res.json(goals)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/goals', validateRequest(goalSchema), async (req, res) => {
    try {
      const goal = await createIdempotent(Goal, uid(req), req.body)
      res.status(201).json(goal)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/goals/:id', validateRequest(goalUpdateSchema), async (req, res) => {
    try {
      const goal = await Goal.findOneAndUpdate({ _id: req.params.id, userId: uid(req) }, req.body, { new: true, runValidators: true })
      if (!goal) return res.status(404).json({ error: 'Not found' })
      res.json(goal)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/goals/:id', async (req, res) => {
    try {
      await Goal.findOneAndDelete({ _id: req.params.id, userId: uid(req) })
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // SETTINGS ENDPOINTS
  // ============================================
  app.get('/api/settings', async (req, res) => {
    try {
      let settings = await Settings.findOne({ userId: uid(req) })
      if (!settings) {
        settings = await Settings.create({
          userId: uid(req),
          timezone: 'UTC',
          multipleThreadsPerWeekTarget: 3,
          gridBalancing: { maxDailyIntensity: 6, preferLowIntensityOnBusyDays: true },
        })
      }
      res.json(settings)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/settings', validateRequest(settingsUpdateSchema), async (req, res) => {
    try {
      let settings = await Settings.findOne({ userId: uid(req) })
      if (!settings) settings = new Settings({ userId: uid(req) })
      const { planner, notifications, gridBalancing, appearance, modules, ...rest } = req.body
      Object.assign(settings, rest)
      // Nested groups merge field by field so a partial update keeps the rest
      for (const [group, value] of Object.entries({ planner, notifications, gridBalancing, appearance, modules })) {
        if (!value) continue
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
          settings.set(`${group}.${key}`, v)
        }
      }
      await settings.save()
      await markNotificationsDirty(uid(req)) // timezone or reminder times may have changed
      res.json(settings)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // ONBOARDING
  // ============================================
  app.get('/api/templates', (_req, res) => {
    res.json({ templates: TEMPLATES, presets: PRESETS })
  })

  app.post('/api/onboarding', validateRequest(onboardingSchema), async (req, res) => {
    try {
      res.status(201).json(await applyOnboarding(uid(req), req.body))
    } catch (error) {
      res.status(error instanceof AlreadyOnboardedError ? 409 : 400).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // PUSH NOTIFICATIONS
  // ============================================
  app.get('/api/push/config', (req, res) => {
    res.json({ enabled: pushConfigured(), publicKey: vapidPublicKey() })
  })

  app.post('/api/push/subscribe', requireVerified, validateRequest(pushSubscriptionSchema), async (req, res) => {
    try {
      // A device belongs to whoever registered it last (shared browser, new account), so this one lookup spans users
      await PushSubscription.findOneAndUpdate(
        { endpoint: req.body.endpoint },
        { ...req.body, userId: uid(req), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) },
        { upsert: true, new: true }
      ).setOptions({ crossUser: true })
      await markNotificationsDirty(uid(req))
      res.status(201).json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/push/unsubscribe', async (req, res) => {
    try {
      if (typeof req.body?.endpoint === 'string') await PushSubscription.deleteOne({ userId: uid(req), endpoint: req.body.endpoint })
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/push/test', requireVerified, async (req, res) => {
    try {
      if (!pushConfigured()) return res.status(503).json({ error: 'Push is not configured on the server (VAPID keys missing).' })
      const result = await sendToUser(uid(req), { title: 'WinterArc', body: 'Notifications are working on this device.', url: '/', tag: 'test' })
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/export', async (req, res) => {
    try {
      const userId = uid(req)
      const threads = await Thread.find({ userId })
      const tasks = await Task.find({ userId })
      const wishlist = await WishlistItem.find({ userId })
      const goals = await Goal.find({ userId })
      const settings = await Settings.findOne({ userId })
      const data = { exportedAt: new Date().toISOString(), threads, tasks, wishlist, goals, settings }
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename="workspace-export.json"')
      res.json(data)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // DROP ENDPOINTS
  // ============================================
  app.get('/api/drop/status', (req, res) => {
    res.json({ storageConfigured: isStorageConfigured() })
  })

  app.post('/api/drop/upload-url', validateRequest(dropUploadUrlSchema), async (req, res) => {
    try {
      const { fileName, mimeType, fileSize } = req.body
      const MAX_SIZE = 100 * 1024 * 1024
      if (fileSize > MAX_SIZE) {
        return res.status(400).json({ error: 'File exceeds 100MB limit' })
      }
      const key = `drop/${uid(req)}/${uuidv4()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}`
      const url = await getPresignedPutUrl(key, mimeType, 300)
      res.json({ uploadUrl: url, s3Key: key })
    } catch (error) {
      res.status(storageErrorStatus(error)).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/drop', validateRequest(dropItemSchema), async (req, res) => {
    try {
      const body = req.body
      // Files live under the owner's own prefix; refuse keys that point anywhere else
      if (body.type === 'file' && !body.s3Key.startsWith(`drop/${uid(req)}/`)) return res.status(400).json({ error: 'Invalid file key' })
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const doc = await DropItem.create({
        userId: uid(req),
        type: body.type,
        s3Key: body.type === 'file' ? body.s3Key : null,
        fileName: body.type === 'file' ? body.fileName : null,
        fileSize: body.type === 'file' ? body.fileSize : null,
        mimeType: body.type === 'file' ? body.mimeType : null,
        textContent: body.type === 'text' || body.type === 'link' ? body.textContent : null,
        createdAt: now,
        expiresAt,
      })
      res.status(201).json(doc)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/drop', async (req, res) => {
    try {
      const items = await DropItem.find({ userId: uid(req), expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
      res.json(items)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/drop/:id/download-url', async (req, res) => {
    try {
      const item = await DropItem.findOne({ _id: req.params.id, userId: uid(req) })
      if (!item || item.type !== 'file' || !item.s3Key) {
        return res.status(404).json({ error: 'File not found' })
      }
      const url = await getPresignedGetUrl(item.s3Key, 300)
      res.json({ downloadUrl: url })
    } catch (error) {
      res.status(storageErrorStatus(error)).json({ error: errorMessage(error) })
    }
  })

  // Start afresh: remove every drop item and its stored file
  app.delete('/api/drop', async (req, res) => {
    try {
      const items = await DropItem.find({ userId: uid(req) }, { type: 1, s3Key: 1 })
      await Promise.all(items
        .filter(i => i.type === 'file' && i.s3Key)
        .map(i => deleteS3Object(i.s3Key!).catch(() => {})))
      const result = await DropItem.deleteMany({ userId: uid(req) })
      res.json({ ok: true, deleted: result.deletedCount ?? 0 })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/drop/:id', async (req, res) => {
    try {
      const item = await DropItem.findOne({ _id: req.params.id, userId: uid(req) })
      if (!item) return res.status(404).json({ error: 'Not found' })
      if (item.type === 'file' && item.s3Key) {
        await deleteS3Object(item.s3Key).catch(() => {})
      }
      await DropItem.deleteOne({ _id: req.params.id, userId: uid(req) })
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.patch('/api/drop/:id', validateRequest(dropUpdateSchema), async (req, res) => {
    try {
      const item = await DropItem.findOneAndUpdate(
        { _id: req.params.id, userId: uid(req) },
        { expiresAt: new Date(req.body.expiresAt) },
        { new: true }
      )
      if (!item) return res.status(404).json({ error: 'Not found' })
      res.json(item)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // ANALYTICS ENDPOINTS
  // ============================================

  // Overall summary for the dashboard cards
  app.get('/api/analytics/summary', async (req, res) => {
    try {
      const timezone = await getTimezone(uid(req))
      const { start, end, label } = quarterRange(new Date(), timezone)

      const tasksInPeriod = await Task.find({ userId: uid(req), date: { $gte: start, $lte: end } }, { status: 1 })
      const { completed, total, rate } = completionStats(tasksInPeriod)

      const activeThreads = await Thread.countDocuments({ userId: uid(req), status: 'active' })
      const totalThreads = await Thread.countDocuments({ userId: uid(req) })

      // Streak spans quarters, so it looks at every completed task
      const doneTasks = await Task.find({ userId: uid(req), status: 'done', completedAt: { $ne: null } }, { completedAt: 1 })
      const streak = computeStreak(doneTasks.map(t => t.completedAt), timezone)

      res.json({
        period: label,
        periodStart: start,
        periodEnd: end,
        streak,
        completionRate: rate,
        completed,
        total,
        activeThreads,
        totalThreads,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // Per-thread performance for the current period
  app.get('/api/analytics/threads', async (req, res) => {
    try {
      const { start, end } = quarterRange(new Date(), await getTimezone(uid(req)))

      const threads = await Thread.find({ userId: uid(req), status: { $ne: 'archived' } })
      const tasks = await Task.find({
        userId: uid(req),
        date: { $gte: start, $lte: end },
        threadId: { $ne: null },
      })

      const grouped: Record<string, { total: number; completed: number }> = {}
      for (const t of tasks) {
        const key = String(t.threadId)
        if (!grouped[key]) grouped[key] = { total: 0, completed: 0 }
        grouped[key].total += 1
        if (t.status === 'done') grouped[key].completed += 1
      }

      const result = threads.map(th => {
        const stats = grouped[String(th._id)] || { total: 0, completed: 0 }
        const rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
        return {
          _id: th._id,
          name: th.name,
          category: th.category,
          frequency: th.frequency,
          status: th.status,
          total: stats.total,
          completed: stats.completed,
          rate,
        }
      })

      // sort: most task activity first, then alphabetical
      result.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name))

      res.json({ period: { start, end }, threads: result })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // ============================================
  // GOOGLE CALENDAR
  // ============================================
  app.get('/api/calendar/status', async (req, res) => {
    try {
      const calendarSync = await CalendarSync.findOne({ userId: uid(req) })
      const isConnected = !!calendarSync && !!(calendarSync.accessToken || calendarSync.refreshToken)
      res.json({ connected: isConnected, configured: calendarConfigured(), lastSyncedAt: calendarSync?.lastSyncedAt ?? null })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // Start OAuth: the app opens the returned URL in a browser
  app.get('/api/calendar/auth', (req, res) => {
    try {
      res.json({ authUrl: getAuthUrl(uid(req)) })
    } catch (error) {
      res.status(503).json({ error: errorMessage(error) })
    }
  })

  // Google redirects the browser here. Open to the internet by design: it is
  // protected by the signed, short-lived `state` created in /api/calendar/auth.
  app.get('/api/calendar/callback', async (req, res) => {
    const origin = (process.env.FRONTEND_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '')
    const back = (status: string) => res.redirect(`${origin}/settings?calendar=${status}`)
    try {
      const { code, state } = req.query
      const userId = typeof state === 'string' ? verifyState(state) : null
      if (typeof code !== 'string' || !userId) return back('error')
      await calendarHandleCallback(userId, code)
      await syncCalendar(userId).catch(err => console.error('Initial calendar sync failed:', errorMessage(err)))
      back('connected')
    } catch (error) {
      console.error('Calendar callback failed:', errorMessage(error))
      back('error')
    }
  })

  app.delete('/api/calendar/disconnect', async (req, res) => {
    try {
      await calendarDisconnect(uid(req))
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/calendar/sync', async (req, res) => {
    try {
      const result = await syncCalendar(uid(req))
      await markNotificationsDirty(uid(req))
      res.json(result)
    } catch (error) {
      res.status(502).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/calendar/events', async (req, res) => {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date.slice(0, 10) : ''
      if (!DAY_KEY_RE.test(date)) return res.status(400).json({ error: 'Invalid date' })
      if (!(await CalendarSync.exists({ userId: uid(req), accessToken: { $ne: null } }))) return res.json({ events: [] })
      const events = await eventsForDay(uid(req), date, await getTimezone(uid(req)))
      res.json({ events: events.map(e => ({ id: e.id, title: e.summary ?? '(no title)', start: e.start!.dateTime, end: e.end?.dateTime ?? e.start!.dateTime })) })
    } catch (error) {
      console.error('Calendar events failed:', errorMessage(error))
      res.json({ events: [] })
    }
  })

  // Unknown API routes get JSON, not the SPA shell
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}

async function startServer() {
  const MONGO_URI = process.env.MONGO_URI
  if (!MONGO_URI) {
    console.error('ERROR: MONGO_URI is required. Set it in your .env file.')
    process.exit(1)
  }

  // MongoDB connection (required) — before the session store, which uses it
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
    console.log('MongoDB connected successfully')
  } catch (err) {
    console.error('MongoDB connection failed:', errorMessage(err))
    process.exit(1)
  }

  const app = createApp()

  // ============================================
  // VITE MIDDLEWARE (DEV) OR STATIC FILES (PROD)
  // ============================================
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else if (existsSync(path.join(process.cwd(), 'dist', 'index.html'))) {
    // Single-service deploy: this server also hosts the built frontend.
    // On Render behind Vercel only the API is built, so this is skipped.
    const distPath = path.join(process.cwd(), 'dist')
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        // Service worker and HTML must revalidate so updates roll out
        if (/(sw\.js|registerSW\.js|index\.html|manifest\.json)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache')
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }))
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(distPath, 'index.html'))
    })
  } else {
    app.get('/', (req, res) => {
      res.json({ service: 'winterarc-api', health: '/api/health' })
    })
  }

  // Commit each recently active user's schedule at startup, then keep checking so
  // days roll over at their local midnight even if nobody opens the app.
  const runDaily = () => generateForActiveUsers()
    .then(r => { if (r.generated) console.log(`Generated schedules for ${r.generated} user(s)`) })
    .catch(err => console.error('Daily generation failed:', errorMessage(err)))
  runDaily()
  setInterval(runDaily, 10 * 60 * 1000)

  startNotificationScheduler()

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Workspace full-stack app running on http://0.0.0.0:${PORT}`)
    console.log(`Connected to MongoDB: ${mongoose.connection.readyState === 1}`)
  })
}

// Start only when run directly (tests import createApp instead)
if (!IS_TEST) {
  startServer().catch((err) => {
    console.error('Server failed to start:', err)
    process.exit(1)
  })
}
