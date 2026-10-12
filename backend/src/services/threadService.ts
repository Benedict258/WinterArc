import { Thread } from '../models/Thread'
import { getPlan } from './planService'
import { threadsSharedWithMe } from './sharedThreadService'
import { createIdempotent } from '../utils/idempotentCreate'

export async function getThreads(userId: string) {
  const own = await Thread.find({ userId, status: { $ne: 'archived' } })
  // threads other people shared with me come along (marked sharedWithMe) so their tasks have names
  return [...own, ...(await threadsSharedWithMe(userId))]
}

/** Free accounts have a cap on live threads. `adding` is how many are about to be created. */
export async function assertThreadRoom(userId: string, adding = 1) {
  const { limits } = await getPlan(userId)
  const have = await Thread.countDocuments({ userId, status: { $ne: 'archived' } })
  if (have + adding > limits.maxThreads) throw new PlanLimitError(`Your plan allows ${limits.maxThreads} threads. Archive some, or upgrade for more.`)
}

export class PlanLimitError extends Error {}

export async function createThread(userId: string, data: any) {
  await assertThreadRoom(userId)
  return await createIdempotent(Thread, userId, data)
}

export async function updateThread(userId: string, id: string, data: any) {
  return await Thread.findOneAndUpdate({ _id: id, userId }, data, { new: true, runValidators: true })
}

export async function deleteThread(userId: string, id: string) {
  return await Thread.findOneAndUpdate({ _id: id, userId }, { status: 'archived' }, { new: true })
}
