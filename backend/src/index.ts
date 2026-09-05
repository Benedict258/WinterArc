import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import { Thread } from './models/Thread'
import { Task } from './models/Task'
import { WishlistItem } from './models/WishlistItem'
import { Goal } from './models/Goal'
import { Settings } from './models/Settings'
import { CalendarSync } from './models/CalendarSync'
import * as threadService from './services/threadService'
import * as taskService from './services/taskService'  
import * as gridService from './services/gridService'
import * as calendarService from './services/calendarService'
import { validateRequest } from './middleware/validationMiddleware'
import { threadSchema, taskSchema, wishlistItemSchema, goalSchema, settingsSchema, gridRegenerateSchema, calendarCallbackSchema } from './utils/validation'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/workspace'
mongoose.set('bufferCommands', false)
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.warn('MongoDB not connected — using mock/offline fallbacks', err))

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
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

app.put('/api/threads/:id', validateRequest(threadSchema), async (req, res) => {
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

app.put('/api/tasks/:id', validateRequest(taskSchema), async (req, res) => {
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
    res.json({ week: tasks.map(t => ({
      _id: t._id,
      title: t.title,
      threadId: t.threadId,
      date: t.date,
      timeBlock: t.timeBlock,
      status: t.status,
      source: t.source,
    })) });  // Fixed the extra parenthesis
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/grid/regenerate', validateRequest(gridRegenerateSchema), async (req, res) => {
  try {
    const startDate = new Date(req.body.date || new Date())
    const result = await gridService.regenerateWeek(startDate)
    res.json({ regenerated: result.length })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// ============================================
// WISHLIST ENDPOINTS
// ============================================

app.get('/api/wishlist', async (req, res) => {
  try {
    const items = await WishlistItem.find()
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

app.put('/api/wishlist/:id', validateRequest(wishlistItemSchema), async (req, res) => {
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
    const goals = await Goal.find()
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

app.put('/api/goals/:id', validateRequest(goalSchema), async (req, res) => {
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
      settings = new Settings({ timezone: 'Africa/Lagos' })
      await settings.save()
    }
    res.json(settings)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.put('/api/settings', validateRequest(settingsSchema), async (req, res) => {
  try {
    let settings = await Settings.findOne()
    if (!settings) {
      settings = new Settings()
    }
    Object.assign(settings, req.body)
    await settings.save()
    res.json(settings)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// ============================================
// GOOGLE CALENDAR ENDPOINTS
// ============================================

app.get('/api/calendar/auth', async (req, res) => {
  try {
    const authUrl = await calendarService.getAuthUrl()
    res.json({ authUrl })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/calendar/callback', validateRequest(calendarCallbackSchema), async (req, res) => {
  try {
    const { code } = req.body
    await calendarService.handleCallback(code)
    const rawFrontendUrl = process.env.FRONTEND_URL || ''
    const frontendUrl = rawFrontendUrl.startsWith('http') ? rawFrontendUrl : ''
    res.redirect(`${frontendUrl}/settings?calendar=connected`)
  } catch (error) {
    const rawFrontendUrl = process.env.FRONTEND_URL || ''
    const frontendUrl = rawFrontendUrl.startsWith('http') ? rawFrontendUrl : ''
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.redirect(`${frontendUrl}/settings?calendar=error&message=${encodeURIComponent(message)}`)
  }
})

app.get('/api/calendar/events', async (req, res) => {
  try {
    let date: Date;
    if (req.query.date) {
      // Handle the case where req.query.date might be an array or ParsedQs
      const dateValue = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date;
      // Convert to string to ensure we pass the right type to Date constructor
      const dateString = typeof dateValue === 'string' ? dateValue : String(dateValue);
      date = new Date(dateString);
    } else {
      date = new Date();
    }
    const events = await calendarService.pullEvents(date)
    res.json({ events })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/calendar/sync', async (req, res) => {
  try {
    // Placeholder for sync logic
    const events = await calendarService.pullEvents(new Date())
    res.json({ success: true, eventCount: events.length })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/calendar/status', async (req, res) => {
  try {
    const calendarSync = await CalendarSync.findOne()
    const isConnected = !!calendarSync && !!calendarSync.accessToken
    res.json({ connected: isConnected })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.delete('/api/calendar/disconnect', async (req, res) => {
  try {
    await CalendarSync.deleteMany({})
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Workspace backend running on http://localhost:${PORT}`)
})