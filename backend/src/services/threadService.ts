import { Thread } from '../models/Thread'

export async function getThreads() {
  return await Thread.find({ status: { $ne: 'archived' } })
}

export async function createThread(data: any) {
  const thread = new Thread(data)
  return await thread.save()
}

export async function updateThread(id: string, data: any) {
  return await Thread.findByIdAndUpdate(id, data, { new: true })
}

export async function deleteThread(id: string) {
  return await Thread.findByIdAndUpdate(id, { status: 'archived' }, { new: true })
}
