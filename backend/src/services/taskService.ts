import { Task } from '../models/Task'

export async function getTasks(filters: any = {}) {
  const query: any = {}

  if (filters.date) {
    // Accept either YYYY-MM-DD or ISO; build a [start, next-day) range in UTC
    const dateStr = String(filters.date).split('T')[0]
    const startDate = new Date(`${dateStr}T00:00:00.000Z`)
    const endDate = new Date(`${dateStr}T00:00:00.000Z`)
    endDate.setUTCDate(endDate.getUTCDate() + 1)
    query.date = { $gte: startDate, $lt: endDate }
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

export async function createTask(data: any) {
  const task = new Task(data)
  return await task.save()
}

export async function updateTask(id: string, data: any) {
  if (data.status === 'done' && !data.completedAt) {
    data.completedAt = new Date()
  }
  return await Task.findByIdAndUpdate(id, data, { new: true })
}

export async function deleteTask(id: string) {
  return await Task.findByIdAndDelete(id)
}

export async function completeTask(id: string) {
  return await Task.findByIdAndUpdate(
    id,
    { status: 'done', completedAt: new Date() },
    { new: true }
  )
}
