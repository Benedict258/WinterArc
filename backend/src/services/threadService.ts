import { Thread } from '../models/Thread'

export async function getThreads() {
  return await Thread.find({ status: { $ne: 'archived' } })
}

export async function createThread(data: any) {
  // Replayed offline create: the first attempt may already have landed
  if (data._id) {
    const existing = await Thread.findById(data._id)
    if (existing) return existing
  }
  const thread = new Thread(data)
  return await thread.save()
}

export async function updateThread(id: string, data: any) {
  return await Thread.findByIdAndUpdate(id, data, { new: true, runValidators: true })
}

export async function deleteThread(id: string) {
  return await Thread.findByIdAndUpdate(id, { status: 'archived' }, { new: true })
}
