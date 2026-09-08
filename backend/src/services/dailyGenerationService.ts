import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { WeeklyProgress } from '../models/WeeklyProgress'
import { startOfWeek, startOfDay, endOfDay, addDays } from 'date-fns'

const TIME_BLOCKS = ['morning', 'afternoon', 'evening'] as const

type Frequency = 'daily' | 'multiple' | 'weekly' | 'fixed-day'

function getTarget(frequency: Frequency): number {
  switch (frequency) {
    case 'daily': return 7
    case 'multiple': return 3
    case 'weekly': return 1
    case 'fixed-day': return 1
  }
}

function getWeekStart(date: Date): Date {
  const ws = startOfWeek(date, { weekStartsOn: 1 })
  return startOfDay(ws)
}

function getNextFreeBlock(date: Date): Promise<string> {
  return Task.find({
    date: { $gte: startOfDay(date), $lt: endOfDay(date) },
    timeBlock: { $in: TIME_BLOCKS }
  }).then(tasks => {
    const counts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 }
    for (const t of tasks) {
      if (t.timeBlock && counts[t.timeBlock] !== undefined) counts[t.timeBlock]++
    }
    const sorted = [...TIME_BLOCKS].sort((a, b) => counts[a] - counts[b])
    return sorted[0]
  })
}

async function incrementWeeklyProgress(threadId: any, weekStart: Date) {
  const ws = startOfDay(weekStart)
  const existing = await WeeklyProgress.findOne({ threadId, weekStart: ws })
  if (existing) {
    existing.appearances += 1
    await existing.save()
    return existing
  }
  const created = await WeeklyProgress.create({ threadId, weekStart: ws, appearances: 1 })
  return created
}

export async function generateToday(date: Date) {
  const targetDate = startOfDay(date)
  const weekStart = getWeekStart(targetDate)
  const dayOfWeek = targetDate.getDay()

  const threads = await Thread.find({ status: 'active' })
  if (threads.length === 0) return []

  const progressDocs = await WeeklyProgress.find({
    threadId: { $in: threads.map(t => t._id) },
    weekStart
  })

  const progressMap = new Map<string, number>()
  for (const p of progressDocs) {
    progressMap.set(String(p.threadId), p.appearances)
  }

  type Candidate = {
    thread: any
    appearances: number
    target: number
    deficit: number
  }

  const candidates: Candidate[] = []

  for (const thread of threads) {
    const freq = thread.frequency as Frequency
    const target = getTarget(freq)
    const appearances = progressMap.get(String(thread._id)) ?? 0

    let isCandidate = false
    if (freq === 'fixed-day') {
      if (typeof thread.fixedDay === 'number' && thread.fixedDay === dayOfWeek && appearances < target) {
        isCandidate = true
      }
    } else if (freq === 'daily') {
      isCandidate = appearances < target
    } else if (freq === 'multiple' || freq === 'weekly') {
      isCandidate = appearances < target
    }

    if (isCandidate) {
      candidates.push({
        thread,
        appearances,
        target,
        deficit: target - appearances
      })
    }
  }

  candidates.sort((a, b) => b.deficit - a.deficit)

  const results = []

  for (const c of candidates) {
    const { thread } = c
    const threadId = thread._id

    const queuedTask = await Task.findOne({
      threadId,
      date: null,
      timeBlock: 'unscheduled'
    }).sort({ createdAt: 1 })

    const block = await getNextFreeBlock(targetDate)

    if (thread.taskMode === 'discrete') {
      if (!queuedTask) {
        // skip per spec
        continue
      }
      queuedTask.date = targetDate
      queuedTask.timeBlock = block
      await queuedTask.save()
      await incrementWeeklyProgress(threadId, weekStart)
      results.push({ threadId, taskId: queuedTask._id, action: 'committed-discrete' })
    } else {
      // continuous
      if (queuedTask) {
        queuedTask.date = targetDate
        queuedTask.timeBlock = block
        await queuedTask.save()
        await incrementWeeklyProgress(threadId, weekStart)
        results.push({ threadId, taskId: queuedTask._id, action: 'committed-continuous-queued' })
      } else {
        const newTask = await Task.create({
          title: thread.name,
          threadId,
          date: targetDate,
          timeBlock: block,
          source: 'auto-generated',
          status: 'pending',
          priority: thread.priority || 'medium',
          intensity: thread.intensity || 'medium'
        })
        await incrementWeeklyProgress(threadId, weekStart)
        results.push({ threadId, taskId: newTask._id, action: 'created-placeholder' })
      }
    }
  }

  return results
}
