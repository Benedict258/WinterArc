import { Thread } from '../models/Thread'
import { createIdempotent } from '../utils/idempotentCreate'

export async function getThreads(userId: string) {
  return await Thread.find({ userId, status: { $ne: 'archived' } })
}

export async function createThread(userId: string, data: any) {
  return await createIdempotent(Thread, userId, data)
}

export async function updateThread(userId: string, id: string, data: any) {
  return await Thread.findOneAndUpdate({ _id: id, userId }, data, { new: true, runValidators: true })
}

export async function deleteThread(userId: string, id: string) {
  return await Thread.findOneAndUpdate({ _id: id, userId }, { status: 'archived' }, { new: true })
}
