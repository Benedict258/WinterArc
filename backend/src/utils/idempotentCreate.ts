import type { Model } from 'mongoose'

/**
 * Create a document, treating a repeat of a client-generated `_id` as "already
 * created". Relies on Mongo's unique `_id` index instead of a find-then-save,
 * so two replays of the same offline create can't both succeed or crash.
 */
export async function createIdempotent<T>(model: Model<T>, data: { _id?: string } & Record<string, unknown>) {
  try {
    return await model.create(data)
  } catch (error: any) {
    if (error?.code === 11000 && data._id) {
      const existing = await model.findById(data._id)
      if (existing) return existing
    }
    throw error
  }
}
