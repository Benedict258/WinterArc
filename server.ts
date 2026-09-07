import express from 'express'
import cors from 'cors'
import path from 'path'
import mongoose from 'mongoose'
import { createServer as createViteServer } from 'vite'

import { Thread } from './backend/src/models/Thread.ts'
import { Task } from './backend/src/models/Task.ts'
import { WishlistItem } from './backend/src/models/WishlistItem.ts'
import { Goal } from './backend/src/models/Goal.ts'
import { Settings } from './backend/src/models/Settings.ts'
import { CalendarSync } from './backend/src/models/CalendarSync.ts'

import * as threadService from './backend/src/services/threadService.ts'
import * as taskService from './backend/src/services/taskService.ts'
import * as gridService from './backend/src/services/gridService.ts'
import { validateRequest } from './backend/src/middleware/validationMiddleware.ts'
import {
  threadSchema,
  threadUpdateSchema,
  taskSchema,
  taskUpdateSchema,
  wishlistItemSchema,
  wishlistItemUpdateSchema,
  goalSchema,
  goalUpdateSchema,
  settingsSchema,
  settingsUpdateSchema,
  gridRegenerateSchema,
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
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnv()

const PORT = 3000
const MONGO_URI = process.env.MONGO_URI

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI is required. Set it in your .env file.')
  process.exit(1)
}

// ============================================
// INITIAL SEED DATA (PRD Section 7)
// ============================================
const seedThreads = [
  { name: 'Blockchain Club FUTMinna Technical Lead', category: 'Role/Program', frequency: 'weekly', status: 'active', notes: 'Weekly team sync and initiatives' },
  { name: 'TEDx FUTMinna Website Manager', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 2, status: 'active', notes: 'Wednesday website updates' },
  { name: 'Wesonline', category: 'Role/Program', frequency: 'weekly', status: 'active', notes: 'Platform maintenance and updates' },
  { name: 'AWS Builder Group Technical Lead', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 5, status: 'active', notes: 'Saturday tech sessions' },
  { name: 'Suiaah Learn sessions', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 2, status: 'active', notes: 'Wednesday learning track' },
  { name: 'Safroi', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'Buiry', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'Tenaxai', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'Cight', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'ECAPs R&D', category: 'Active Build', frequency: 'multiple', status: 'active', notes: 'Sensor calibration & embedded research' },
  { name: 'Agentic Architecture (Engineering/Robotics) R&D', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Prive/PriveStudios', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Pathfinder.io', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Solar Panel/Renewable Energy R&D', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'ESS', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Computer Vision', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'HackerRank/LeetCode', category: 'Learning Track', frequency: 'daily', status: 'active', notes: 'Daily problem solving' },
  { name: 'Python relearning', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'Nvidia Courses/CUDA', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'System design & architecture', category: 'Learning Track', frequency: 'weekly', status: 'active' },
  { name: 'Backend projects', category: 'Learning Track', frequency: 'weekly', status: 'active' },
  { name: 'Java — RedHat course', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'AI Automation', category: 'Learning Track', frequency: 'weekly', status: 'active' },
  { name: 'Mechatronics skills — Matlab/Proteus/Arduino', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'Learning new tech by building with it', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'Jobs & gigs applications', category: 'Application/Outreach', frequency: 'daily', status: 'active', notes: 'Daily outreach and pipeline' },
  { name: 'Scholarships/grants applications', category: 'Application/Outreach', frequency: 'daily', status: 'active' },
  { name: 'LinkedIn posting', category: 'Application/Outreach', frequency: 'multiple', status: 'active' },
  { name: 'Huawei Competition prep', category: 'Application/Outreach', frequency: 'multiple', status: 'active' },
  { name: 'Kebbi Plan', category: 'Other', frequency: 'fixed-day', fixedDay: 5, status: 'active', notes: 'Saturday rest & catch-up' },
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

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(date.setDate(diff))
  mon.setHours(0, 0, 0, 0)
  return mon
}

function formatDateOnly(d: Date) {
  return d.toISOString().split('T')[0]
}

async function ensureConnected() {
  if (mongoose.connection.readyState === 1) return
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
}

async function seedIfEmpty() {
  await ensureConnected()
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

async function startServer() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // MongoDB connection (required)
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
    console.log('MongoDB connected successfully')
    await seedIfEmpty()
  } catch (err) {
    console.error('MongoDB connection failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mongoConnected: mongoose.connection.readyState === 1,
    })
  })

  // ============================================
  // THREAD ENDPOINTS
  // ============================================
  app.get('/api/threads', async (req, res) => {
    try {
      const threads = await threadService.getThreads()
      res.json(threads)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.post('/api/threads', validateRequest(threadSchema), async (req, res) => {
    try {
      const thread = await threadService.createThread(req.body)
      res.status(201).json(thread)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.put('/api/threads/:id', validateRequest(threadUpdateSchema), async (req, res) => {
    try {
      const thread = await threadService.updateThread(req.params.id, req.body)
      res.json(thread)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.delete('/api/threads/:id', async (req, res) => {
    try {
      const result = await threadService.deleteThread(req.params.id)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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

      const completionDates = new Set(
        tasks
          .filter(t => t.status === 'done' && t.completedAt)
          .map(t => new Date(t.completedAt!).toISOString().split('T')[0])
      )
      let streak = 0
      const cursor = new Date()
      if (!completionDates.has(cursor.toISOString().split('T')[0])) {
        cursor.setDate(cursor.getDate() - 1)
      }
      while (completionDates.has(cursor.toISOString().split('T')[0])) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      }

      const lastActivity = tasks
        .filter(t => t.completedAt)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]?.completedAt || null

      const todayStr = new Date().toISOString().split('T')[0]
      const upcomingTasks = tasks
        .filter(t => t.status !== 'done' && t.date && new Date(t.date).toISOString().split('T')[0] >= todayStr)
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.post('/api/threads/:id/resources', async (req, res) => {
    try {
      const { title, url, description, kind } = req.body || {}
      if (!title || !url) {
        res.status(400).json({ error: 'title and url are required' })
        return
      }
      const thread = await Thread.findById(req.params.id)
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' })
        return
      }
      thread.resources.push({ title, url, description: description || '', kind: kind === 'resource' ? 'resource' : 'link' } as any)
      await thread.save()
      res.status(201).json(thread.resources[thread.resources.length - 1])
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  // ============================================
  // TASK ENDPOINTS
  // ============================================
  app.get('/api/tasks', async (req, res) => {
    try {
      const filters: any = {}
      if (req.query.date) filters.date = req.query.date
      if (req.query.status) filters.status = req.query.status
      if (req.query.threadId) filters.threadId = req.query.threadId
      const tasks = await taskService.getTasks(filters)
      res.json(tasks)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.post('/api/tasks', validateRequest(taskSchema), async (req, res) => {
    try {
      const task = await taskService.createTask(req.body)
      res.status(201).json(task)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.put('/api/tasks/:id', validateRequest(taskUpdateSchema), async (req, res) => {
    try {
      const task = await taskService.updateTask(req.params.id, req.body)
      res.json(task)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.patch('/api/tasks/:id/complete', async (req, res) => {
    try {
      const task = await taskService.completeTask(req.params.id)
      res.json(task)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const result = await taskService.deleteTask(req.params.id)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  // ============================================
  // GRID ENDPOINTS
  // ============================================
  app.get('/api/grid/week/:date', async (req, res) => {
    try {
      const startDate = new Date(req.params.date)
      const tasks = await gridService.getWeek(startDate)
      res.json({
        week: tasks.map((t: any) => ({
          _id: t._id,
          title: t.title,
          threadId: t.threadId,
          date: t.date,
          timeBlock: t.timeBlock,
          status: t.status,
          source: t.source,
          priority: t.priority,
          intensity: t.intensity,
        })),
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.post('/api/grid/regenerate', validateRequest(gridRegenerateSchema), async (req, res) => {
    try {
      const targetDate = req.body?.date ? new Date(req.body.date) : new Date()
      const result = await gridService.regenerateWeek(targetDate)
      res.json({ regenerated: result.length })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.get('/api/grid/settings', async (req, res) => {
    try {
      const balancing = await gridService.getGridSettings()
      res.json(balancing)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.put('/api/grid/settings', async (req, res) => {
    try {
      const balancing = await gridService.updateGridSettings(req.body || {})
      res.json(balancing)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.post('/api/wishlist', validateRequest(wishlistItemSchema), async (req, res) => {
    try {
      const item = new WishlistItem(req.body)
      await item.save()
      res.status(201).json(item)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.put('/api/wishlist/:id', validateRequest(wishlistItemUpdateSchema), async (req, res) => {
    try {
      const item = await WishlistItem.findByIdAndUpdate(req.params.id, req.body, { new: true })
      res.json(item)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.delete('/api/wishlist/:id', async (req, res) => {
    try {
      await WishlistItem.findByIdAndDelete(req.params.id)
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.post('/api/goals', validateRequest(goalSchema), async (req, res) => {
    try {
      const goal = new Goal(req.body)
      await goal.save()
      res.status(201).json(goal)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.put('/api/goals/:id', validateRequest(goalUpdateSchema), async (req, res) => {
    try {
      const goal = await Goal.findByIdAndUpdate(req.params.id, req.body, { new: true })
      res.json(goal)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.delete('/api/goals/:id', async (req, res) => {
    try {
      await Goal.findByIdAndDelete(req.params.id)
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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

      const tasksInPeriod = await Task.find({
        date: { $gte: start, $lte: end },
      })
      const completedInPeriod = tasksInPeriod.filter(t => t.status === 'done')
      const total = tasksInPeriod.length
      const done = completedInPeriod.length
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

      const activeThreads = await Thread.countDocuments({ status: 'active' })
      const totalThreads = await Thread.countDocuments()

      // Daily completion streak (consecutive days where at least one task was completed)
      const completionDates = new Set(
        completedInPeriod
          .map(t => t.completedAt ? new Date(t.completedAt).toISOString().split('T')[0] : null)
          .filter(Boolean) as string[]
      )
      let streak = 0
      const today = new Date()
      const cursor = new Date(today)
      // If today not completed but yesterday was, streak still alive (counts from yesterday)
      if (!completionDates.has(formatDateOnly(cursor))) {
        cursor.setDate(cursor.getDate() - 1)
      }
      while (completionDates.has(formatDateOnly(cursor))) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      }

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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  app.get('/api/calendar/events', async (req, res) => {
    res.json({ events: [] })
  })

  // ============================================
  // VITE MIDDLEWARE (DEV) OR STATIC FILES (PROD)
  // ============================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.join(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Workspace full-stack app running on http://0.0.0.0:${PORT}`)
    console.log(`Connected to MongoDB: ${mongoose.connection.readyState === 1}`)
  })
}

startServer().catch((err) => {
  console.error('Server failed to start:', err)
  process.exit(1)
})
