import express from 'express'
import cors from 'cors'
import path from 'path'
import crypto from 'crypto'
import mongoose from 'mongoose'
import session from 'express-session'
import { MongoStore } from 'connect-mongo'

import { Thread } from './backend/src/models/Thread.ts'
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
import { ensureTodayGenerated, rebalanceToday, toDayKey, DEFAULT_TIMEZONE } from './backend/src/services/dailyGenerationService.ts'
import { validateRequest } from './backend/src/middleware/validationMiddleware.ts'
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
  gridBalancingUpdateSchema,
  dropUploadUrlSchema,
  dropItemSchema,
  dropUpdateSchema,
  loginSchema,
} from './backend/src/utils/validation.ts'

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean
  }
}

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
const MONGO_URI = process.env.MONGO_URI
const IS_PROD = process.env.NODE_ENV === 'production'

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI is required. Set it in your .env file.')
  process.exit(1)
}
if (!process.env.APP_PASSCODE) {
  console.error('ERROR: APP_PASSCODE is required. Set it in your .env file.')
  process.exit(1)
}
if (IS_PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error('ERROR: SESSION_SECRET (32+ chars) is required in production.')
  process.exit(1)
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')

// ============================================
// INITIAL SEED DATA (PRD Section 7)
// fixedDay: 0 = Monday … 6 = Sunday
// ============================================
const seedThreads = [
  { name: 'Blockchain Club FUTMinna Technical Lead', category: 'Role/Program', frequency: 'weekly', status: 'active', taskMode: 'discrete', notes: 'Weekly team sync and initiatives' },
  { name: 'TEDx FUTMinna Website Manager', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 2, status: 'active', taskMode: 'discrete', notes: 'Wednesday website updates' },
  { name: 'Wesonline', category: 'Role/Program', frequency: 'weekly', status: 'active', taskMode: 'discrete', notes: 'Platform maintenance and updates' },
  { name: 'AWS Builder Group Technical Lead', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 5, status: 'active', taskMode: 'discrete', notes: 'Saturday tech sessions' },
  { name: 'Suiaah Learn sessions', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 2, status: 'active', taskMode: 'discrete', notes: 'Wednesday learning track' },
  { name: 'Safroi', category: 'Active Build', frequency: 'weekly', status: 'active', taskMode: 'discrete' },
  { name: 'Buiry', category: 'Active Build', frequency: 'weekly', status: 'active', taskMode: 'discrete' },
  { name: 'Tenaxai', category: 'Active Build', frequency: 'weekly', status: 'active', taskMode: 'discrete' },
  { name: 'Cight', category: 'Active Build', frequency: 'weekly', status: 'active', taskMode: 'discrete' },
  { name: 'ECAPs R&D', category: 'Active Build', frequency: 'multiple', status: 'active', taskMode: 'discrete', notes: 'Sensor calibration & embedded research' },
  { name: 'Agentic Architecture (Engineering/Robotics) R&D', category: 'Active Build', frequency: 'multiple', status: 'active', taskMode: 'discrete' },
  { name: 'Prive/PriveStudios', category: 'Active Build', frequency: 'multiple', status: 'active', taskMode: 'discrete' },
  { name: 'Pathfinder.io', category: 'Active Build', frequency: 'multiple', status: 'active', taskMode: 'discrete' },
  { name: 'Solar Panel/Renewable Energy R&D', category: 'Active Build', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'ESS', category: 'Active Build', frequency: 'multiple', status: 'active', taskMode: 'discrete' },
  { name: 'Computer Vision', category: 'Learning Track', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'HackerRank/LeetCode', category: 'Learning Track', frequency: 'daily', status: 'active', taskMode: 'continuous', notes: 'Daily problem solving' },
  { name: 'Python relearning', category: 'Learning Track', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'Nvidia Courses/CUDA', category: 'Learning Track', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'System design & architecture', category: 'Learning Track', frequency: 'weekly', status: 'active', taskMode: 'continuous' },
  { name: 'Backend projects', category: 'Learning Track', frequency: 'weekly', status: 'active', taskMode: 'continuous' },
  { name: 'Java — RedHat course', category: 'Learning Track', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'AI Automation', category: 'Learning Track', frequency: 'weekly', status: 'active', taskMode: 'continuous' },
  { name: 'Mechatronics skills — Matlab/Proteus/Arduino', category: 'Learning Track', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'Learning new tech by building with it', category: 'Learning Track', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'Jobs & gigs applications', category: 'Application/Outreach', frequency: 'daily', status: 'active', taskMode: 'continuous', notes: 'Daily outreach and pipeline' },
  { name: 'Scholarships/grants applications', category: 'Application/Outreach', frequency: 'daily', status: 'active', taskMode: 'continuous' },
  { name: 'LinkedIn posting', category: 'Application/Outreach', frequency: 'multiple', status: 'active', taskMode: 'continuous' },
  { name: 'Huawei Competition prep', category: 'Application/Outreach', frequency: 'multiple', status: 'active', taskMode: 'discrete' },
  { name: 'Kebbi Plan', category: 'Other', frequency: 'fixed-day', fixedDay: 5, status: 'active', taskMode: 'continuous', notes: 'Saturday rest & catch-up' },
]

const seedWishlist = [
  { item: 'Webcam', note: 'High resolution streaming/meetings', acquired: false },
  { item: 'VGA-to-HDMI adapter', note: 'External monitor setup', acquired: false },
  { item: 'Phone', note: 'Hardware upgrade for mobile testing', acquired: false },
]

const seedGoals = [
  { period: 'Q3-2026', text: 'Ship production-ready offline-first PWA Workspace hub replacing Notion' },
  { period: 'Q4-2026', text: 'Maintain 90%+ daily completion consistency across all Active Threads' },
  { period: 'Q4-2026', text: 'Secure AWS Builder Group milestone & complete Nvidia CUDA certification' },
]

async function getTimezone() {
  const settings = await Settings.findOne()
  return settings?.timezone || DEFAULT_TIMEZONE
}

/** Consecutive days (in the user's timezone) with at least one completed task. */
function computeStreak(completedAts: (Date | null | undefined)[], timezone: string) {
  const days = new Set(completedAts.filter(Boolean).map(d => toDayKey(new Date(d!), timezone)))
  let streak = 0
  const cursor = new Date()
  // If today isn't done yet but yesterday was, the streak is still alive
  if (!days.has(toDayKey(cursor, timezone))) cursor.setTime(cursor.getTime() - 86400000)
  while (days.has(toDayKey(cursor, timezone))) {
    streak++
    cursor.setTime(cursor.getTime() - 86400000)
  }
  return streak
}

async function seedIfEmpty() {
  const threadCount = await Thread.countDocuments()
  if (threadCount === 0) {
    await Thread.insertMany(seedThreads)
    console.log(`Seeded ${seedThreads.length} threads`)
  }
  const wishCount = await WishlistItem.countDocuments()
  if (wishCount === 0) {
    await WishlistItem.insertMany(seedWishlist)
    console.log(`Seeded ${seedWishlist.length} wishlist items`)
  }
  const goalCount = await Goal.countDocuments()
  if (goalCount === 0) {
    await Goal.insertMany(seedGoals)
    console.log(`Seeded ${seedGoals.length} goals`)
  }
  const settingsCount = await Settings.countDocuments()
  if (settingsCount === 0) {
    await Settings.create({
      timezone: 'Africa/Lagos',
      multipleThreadsPerWeekTarget: 3,
      gridBalancing: { maxDailyIntensity: 6, preferLowIntensityOnBusyDays: true },
    })
    console.log('Seeded default settings')
  }
}

// ============================================
// LOGIN RATE LIMITING (single-process, in-memory)
// ============================================
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
// Behind Vercel → Render the client IP comes from X-Forwarded-For, which a
// request sent straight to Render can forge. The global cap bounds brute
// force even if per-IP keys are spoofed.
const LOGIN_MAX_GLOBAL_FAILURES = 50
const GLOBAL_KEY = '__global__'
const loginFailures = new Map<string, { count: number; first: number }>()

function failureCount(key: string) {
  const entry = loginFailures.get(key)
  if (!entry) return 0
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginFailures.delete(key)
    return 0
  }
  return entry.count
}

function loginBlocked(ip: string) {
  return failureCount(ip) >= LOGIN_MAX_FAILURES || failureCount(GLOBAL_KEY) >= LOGIN_MAX_GLOBAL_FAILURES
}

function recordLoginFailure(ip: string) {
  for (const key of [ip, GLOBAL_KEY]) {
    const entry = loginFailures.get(key)
    if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
      loginFailures.set(key, { count: 1, first: Date.now() })
    } else {
      entry.count++
    }
  }
}

/** Number of proxy hops in front of the app (Render = 1; Vercel → Render = 2). */
function trustProxySetting() {
  const raw = process.env.TRUST_PROXY
  if (!raw) return 1
  if (/^\d+$/.test(raw)) return Number(raw)
  return raw === 'true' ? true : raw
}

const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || 'https://winterarc.benedictisaac.dev')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

function passcodeMatches(input: string) {
  const expected = crypto.createHash('sha256').update(process.env.APP_PASSCODE!).digest()
  const actual = crypto.createHash('sha256').update(input).digest()
  return crypto.timingSafeEqual(expected, actual)
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function storageErrorStatus(error: unknown) {
  return error instanceof StorageNotConfiguredError ? 503 : 500
}

async function startServer() {
  // MongoDB connection (required) — before the session store, which uses it
  try {
    await mongoose.connect(MONGO_URI!, { serverSelectionTimeoutMS: 8000 })
    console.log('MongoDB connected successfully')
    await seedIfEmpty()
  } catch (err) {
    console.error('MongoDB connection failed:', errorMessage(err))
    process.exit(1)
  }

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
    // Persist sessions in Mongo so a PM2 restart doesn't log you out
    store: MongoStore.create({
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

  // ============================================
  // AUTH
  // ============================================
  app.post('/api/auth/login', validateRequest(loginSchema), (req, res) => {
    const ip = req.ip || 'unknown'
    if (loginBlocked(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
    }
    if (!passcodeMatches(req.body.passcode)) {
      recordLoginFailure(ip)
      return res.status(401).json({ error: 'Invalid passcode' })
    }
    loginFailures.delete(ip)
    // New session id on login (prevents session fixation)
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Login failed' })
      req.session.authenticated = true
      req.session.save(() => res.json({ ok: true }))
    })
  })

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('winterarc.sid')
      res.json({ ok: true })
    })
  })

  app.get('/api/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ authenticated: !!req.session?.authenticated })
  })

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

  // Protect all API routes except auth/health
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path === '/health') return next()
    if (req.session?.authenticated) return next()
    return res.status(401).json({ error: 'Unauthorized' })
  })

  // Lazily commit today's schedule the first time anything asks for tasks
  const withToday = async (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    try {
      await ensureTodayGenerated()
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
      const threads = await threadService.getThreads()
      res.json(threads)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/threads', validateRequest(threadSchema), async (req, res) => {
    try {
      const thread = await threadService.createThread(req.body)
      res.status(201).json(thread)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/threads/:id', validateRequest(threadUpdateSchema), async (req, res) => {
    try {
      const thread = await threadService.updateThread(req.params.id, req.body)
      if (!thread) return res.status(404).json({ error: 'Thread not found' })
      res.json(thread)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/threads/:id', async (req, res) => {
    try {
      const result = await threadService.deleteThread(req.params.id)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/threads/:id/stats', async (req, res) => {
    try {
      const { id } = req.params
      const thread = await Thread.findById(id)
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' })
        return
      }

      const timezone = await getTimezone()
      const now = new Date()
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1, 0, 0, 0, 0)
      const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0, 23, 59, 59, 999)

      const tasks = await Task.find({ threadId: id })
      const quarterTasks = tasks.filter(t => {
        if (!t.date) return false
        const d = new Date(t.date)
        return d >= quarterStart && d <= quarterEnd
      })
      const quarterDone = quarterTasks.filter(t => t.status === 'done').length
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
        tasksThisQuarter: { total: quarterTasks.length, completed: quarterDone, rate: quarterTasks.length > 0 ? Math.round((quarterDone / quarterTasks.length) * 100) : 0 },
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
      const { title, url, description, kind } = req.body
      const thread = await Thread.findById(req.params.id)
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' })
        return
      }
      thread.resources.push({ title, url, description: description || '', kind: kind === 'resource' ? 'resource' : 'link' } as any)
      await thread.save()
      res.status(201).json(thread.resources[thread.resources.length - 1])
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/threads/:id/resources/:resourceId', async (req, res) => {
    try {
      const thread = await Thread.findById(req.params.id)
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
      if (str(req.query.status)) filters.status = str(req.query.status)
      if (str(req.query.threadId) !== undefined) filters.threadId = str(req.query.threadId)
      const tasks = await taskService.getTasks(filters)
      res.json(tasks)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/tasks', validateRequest(taskSchema), async (req, res) => {
    try {
      const task = await taskService.createTask(req.body)
      res.status(201).json(task)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/tasks/:id', validateRequest(taskUpdateSchema), async (req, res) => {
    try {
      const task = await taskService.updateTask(req.params.id, req.body)
      if (!task) return res.status(404).json({ error: 'Task not found' })
      res.json(task)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.patch('/api/tasks/:id/complete', async (req, res) => {
    try {
      const task = await taskService.completeTask(req.params.id)
      if (!task) return res.status(404).json({ error: 'Task not found' })
      res.json(task)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const result = await taskService.deleteTask(req.params.id)
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
      const { weekStart, tasks, forecast } = await gridService.getWeek(req.params.date)
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
        })),
        forecast,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/grid/rebalance', async (req, res) => {
    try {
      res.json(await rebalanceToday())
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/grid/settings', async (req, res) => {
    try {
      const balancing = await gridService.getGridSettings()
      res.json(balancing)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/grid/settings', validateRequest(gridBalancingUpdateSchema), async (req, res) => {
    try {
      const balancing = await gridService.updateGridSettings(req.body)
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
      const items = await WishlistItem.find().sort({ acquired: 1, createdAt: -1 })
      res.json(items)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/wishlist', validateRequest(wishlistItemSchema), async (req, res) => {
    try {
      const item = new WishlistItem(req.body)
      await item.save()
      res.status(201).json(item)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/wishlist/:id', validateRequest(wishlistItemUpdateSchema), async (req, res) => {
    try {
      const item = await WishlistItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      if (!item) return res.status(404).json({ error: 'Not found' })
      res.json(item)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/wishlist/:id', async (req, res) => {
    try {
      await WishlistItem.findByIdAndDelete(req.params.id)
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
      const goals = await Goal.find().sort({ period: -1, createdAt: -1 })
      res.json(goals)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/goals', validateRequest(goalSchema), async (req, res) => {
    try {
      const goal = new Goal(req.body)
      await goal.save()
      res.status(201).json(goal)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put('/api/goals/:id', validateRequest(goalUpdateSchema), async (req, res) => {
    try {
      const goal = await Goal.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      if (!goal) return res.status(404).json({ error: 'Not found' })
      res.json(goal)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/goals/:id', async (req, res) => {
    try {
      await Goal.findByIdAndDelete(req.params.id)
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
      let settings = await Settings.findOne()
      if (!settings) {
        settings = await Settings.create({
          timezone: 'Africa/Lagos',
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
      let settings = await Settings.findOne()
      if (!settings) settings = new Settings()
      Object.assign(settings, req.body)
      await settings.save()
      res.json(settings)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/export', async (req, res) => {
    try {
      const threads = await Thread.find()
      const tasks = await Task.find()
      const wishlist = await WishlistItem.find()
      const goals = await Goal.find()
      const settings = await Settings.findOne()
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
      const key = `drop/${uuidv4()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}`
      const url = await getPresignedPutUrl(key, mimeType, 300)
      res.json({ uploadUrl: url, s3Key: key })
    } catch (error) {
      res.status(storageErrorStatus(error)).json({ error: errorMessage(error) })
    }
  })

  app.post('/api/drop', validateRequest(dropItemSchema), async (req, res) => {
    try {
      const body = req.body
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const doc = await DropItem.create({
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
      const items = await DropItem.find({ expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
      res.json(items)
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/drop/:id/download-url', async (req, res) => {
    try {
      const item = await DropItem.findById(req.params.id)
      if (!item || item.type !== 'file' || !item.s3Key) {
        return res.status(404).json({ error: 'File not found' })
      }
      const url = await getPresignedGetUrl(item.s3Key, 300)
      res.json({ downloadUrl: url })
    } catch (error) {
      res.status(storageErrorStatus(error)).json({ error: errorMessage(error) })
    }
  })

  app.delete('/api/drop/:id', async (req, res) => {
    try {
      const item = await DropItem.findById(req.params.id)
      if (!item) return res.status(404).json({ error: 'Not found' })
      if (item.type === 'file' && item.s3Key) {
        await deleteS3Object(item.s3Key).catch(() => {})
      }
      await DropItem.deleteOne({ _id: req.params.id })
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.patch('/api/drop/:id', validateRequest(dropUpdateSchema), async (req, res) => {
    try {
      const item = await DropItem.findByIdAndUpdate(
        req.params.id,
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

  // Helper: get the "current period" date range. Default = current quarter (Q).
  function getCurrentQuarterRange() {
    const now = new Date()
    const month = now.getMonth() // 0-11
    const quarter = Math.floor(month / 3) // 0-3
    const startMonth = quarter * 3
    const start = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59, 999)
    const label = `Q${quarter + 1}-${now.getFullYear()}`
    return { start, end, label }
  }

  // Overall summary for the dashboard cards
  app.get('/api/analytics/summary', async (req, res) => {
    try {
      const { start, end, label } = getCurrentQuarterRange()
      const timezone = await getTimezone()

      const tasksInPeriod = await Task.find({
        date: { $gte: start, $lte: end },
      })
      const completedInPeriod = tasksInPeriod.filter(t => t.status === 'done')
      const total = tasksInPeriod.length
      const done = completedInPeriod.length
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

      const activeThreads = await Thread.countDocuments({ status: 'active' })
      const totalThreads = await Thread.countDocuments()

      const streak = computeStreak(completedInPeriod.map(t => t.completedAt), timezone)

      res.json({
        period: label,
        periodStart: start,
        periodEnd: end,
        streak,
        completionRate,
        completed: done,
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
      const { start, end } = getCurrentQuarterRange()

      const threads = await Thread.find({ status: { $ne: 'archived' } })
      const tasks = await Task.find({
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
  // CALENDAR STATUS (read-only stub; OAuth deferred)
  // ============================================
  app.get('/api/calendar/status', async (req, res) => {
    try {
      const calendarSync = await CalendarSync.findOne()
      const isConnected = !!calendarSync && !!calendarSync.accessToken
      res.json({ connected: isConnected, lastSyncedAt: calendarSync?.lastSyncedAt ?? null })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get('/api/calendar/events', async (req, res) => {
    res.json({ events: [] })
  })

  // Unknown API routes get JSON, not the SPA shell
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

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

  // Commit today's schedule at startup, then keep checking so the day rolls
  // over at midnight even if nobody opens the app.
  const runDaily = () => ensureTodayGenerated()
    .then(r => { if (r.generated) console.log(`Generated schedule for ${r.dayKey}`) })
    .catch(err => console.error('Daily generation failed:', errorMessage(err)))
  runDaily()
  setInterval(runDaily, 10 * 60 * 1000)

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Workspace full-stack app running on http://0.0.0.0:${PORT}`)
    console.log(`Connected to MongoDB: ${mongoose.connection.readyState === 1}`)
  })
}

startServer().catch((err) => {
  console.error('Server failed to start:', err)
  process.exit(1)
})
