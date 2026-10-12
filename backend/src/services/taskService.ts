import { resolveTaskBlock } from './dayBlocksService'
import { canAttachTasks } from './sharedThreadService'
import { markNotificationsDirty } from './notificationService'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { createIdempotent } from '../utils/idempotentCreate'

export async function getTasks(userId: string, filters: any = {}) {
  const query: any = { userId }

  if (filters.date) {
    // Accept either YYYY-MM-DD or ISO; build a [start, next-day) range in UTC
    const dateStr = String(filters.date).split('T')[0]
    const startDate = new Date(`${dateStr}T00:00:00.000Z`)
    const endDate = new Date(`${dateStr}T00:00:00.000Z`)
    endDate.setUTCDate(endDate.getUTCDate() + 1)
    query.date = { $gte: startDate, $lt: endDate }
  }

  // Earlier days only (before) and no further back than `since`: used for the Overdue list
  if (filters.before || filters.since) {
    query.date = {
      ...(filters.since ? { $gte: new Date(`${String(filters.since).slice(0, 10)}T00:00:00.000Z`) } : {}),
      ...(filters.before ? { $lt: new Date(`${String(filters.before).slice(0, 10)}T00:00:00.000Z`) } : {}),
    }
  }

  if (filters.status) query.status = filters.status
  if (filters.threadId !== undefined && filters.threadId !== null) {
    if (filters.threadId === 'null' || filters.threadId === '') {
      query.threadId = null
    } else {
      query.threadId = filters.threadId
    }
  }

  return await Task.find(query).sort({ date: 1, createdAt: 1 })
}

/** A task may only point at one of the user's own threads. */
async function assertOwnThread(userId: string, threadId: unknown) {
  if (threadId && !(await Thread.exists({ _id: threadId, userId })) && !(await canAttachTasks(userId, String(threadId)))) {
    throw new Error('Thread not found')
  }
}

// Changes to events, dates or due dates can move a reminder, so the scheduler should look again
const affectsReminders = (data: any) => ['isEvent', 'startTime', 'date', 'dueDate', 'status'].some(k => data?.[k] !== undefined)

export async function createTask(userId: string, data: any) {
  await assertOwnThread(userId, data.threadId)
  if (data.timeBlock !== undefined) data.timeBlock = await resolveTaskBlock(userId, data.timeBlock)
  const task = await createIdempotent(Task, userId, data)
  if (affectsReminders(data)) await markNotificationsDirty(userId)
  return task
}

export async function updateTask(userId: string, id: string, data: any) {
  await assertOwnThread(userId, data.threadId)
  if (data.timeBlock !== undefined) data.timeBlock = await resolveTaskBlock(userId, data.timeBlock)
  if (data.status === 'done' && !data.completedAt) {
    data.completedAt = new Date()
  }
  // Moving a task yourself makes it yours: Rebalance won't touch it
  if (data.date !== undefined || data.timeBlock !== undefined) {
    data.scheduledBy = null
  }
  const task = await Task.findOneAndUpdate({ _id: id, userId }, data, { new: true, runValidators: true })
  if (affectsReminders(data)) await markNotificationsDirty(userId)
  return task
}

export async function deleteTask(userId: string, id: string) {
  const task = await Task.findOneAndDelete({ _id: id, userId })
  if (task?.isEvent || task?.dueDate) await markNotificationsDirty(userId)
  return task
}

export async function completeTask(userId: string, id: string) {
  return await Task.findOneAndUpdate(
    { _id: id, userId },
    { status: 'done', completedAt: new Date() },
    { new: true }
  )
}
