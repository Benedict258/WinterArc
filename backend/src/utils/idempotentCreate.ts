import type { Model } from 'mongoose'

/**
 * Create a user's document, treating a repeat of a client-generated `_id` as
 * "already created" (offline replays). Relies on Mongo's unique `_id` index, so two
 * replays can't both succeed. A repeated id that belongs to someone else is never
 * returned: it is rejected like any other duplicate.
 */
export async function createIdempotent<T>(model: Model<T>, userId: string, data: { _id?: string } & Record<string, unknown>) {
  try {
    return await model.create({ ...data, userId })
  } catch (error: any) {
    if (error?.code === 11000 && data._id) {
      const mine = await model.findOne({ _id: data._id, userId } as any)
      if (mine) return mine
    }
    throw error
  }
}
