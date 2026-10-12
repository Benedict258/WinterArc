import { User } from '../models/User'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Goal } from '../models/Goal'
import { WishlistItem } from '../models/WishlistItem'
import { Settings } from '../models/Settings'
import { CalendarSync } from '../models/CalendarSync'
import { PushSubscription } from '../models/PushSubscription'
import { DropItem } from '../models/DropItem'
import { NotificationLog } from '../models/NotificationLog'
import { ApiToken } from '../models/ApiToken'
import { EmailToken } from '../models/EmailToken'
import { AiUsage } from '../models/AiUsage'
import { AiProposal } from '../models/AiProposal'
import { deleteS3Object } from './s3'
import { removeAllFor } from './partnerService'
import { removeAllSharingFor } from './sharedThreadService'

/** Everything we hold about a person, as one JSON document (their copy of their data). */
export async function exportAccount(userId: string) {
  const [user, settings, threads, tasks, goals, wishlist, drop] = await Promise.all([
    User.findOne({ _id: userId }),
    Settings.findOne({ userId }),
    Thread.find({ userId }),
    Task.find({ userId }),
    Goal.find({ userId }),
    WishlistItem.find({ userId }),
    // file contents live in storage; the export lists them (name, size, type) and carries text and links
    DropItem.find({ userId }, { s3Key: 0 }),
  ])
  const strip = (doc: any) => { const o = doc?.toObject ? doc.toObject() : doc; if (o) { delete o.nextCheckAt; delete o.__v } return o }
  return {
    exportedAt: new Date().toISOString(),
    profile: user && { email: user.email, name: user.name, createdAt: user.createdAt, emailVerified: !!user.emailVerifiedAt, termsAcceptedAt: user.termsAcceptedAt, termsVersion: user.termsVersion },
    settings: strip(settings),
    threads, tasks, goals, wishlist, drop,
  }
}

/** Erase an account: stored files, every record, devices, tokens and the user itself. Irreversible. */
export async function deleteAccount(userId: string) {
  const files = await DropItem.find({ userId, type: 'file' }, { s3Key: 1 })
  await Promise.all(files.filter(f => f.s3Key).map(f => deleteS3Object(f.s3Key!).catch(() => {})))
  const results = await Promise.all([
    Task.deleteMany({ userId }),
    Thread.deleteMany({ userId }),
    Goal.deleteMany({ userId }),
    WishlistItem.deleteMany({ userId }),
    DropItem.deleteMany({ userId }),
    CalendarSync.deleteMany({ userId }),
    PushSubscription.deleteMany({ userId }),
    NotificationLog.deleteMany({ userId }),
    ApiToken.deleteMany({ userId }),
    EmailToken.deleteMany({ userId }),
    Settings.deleteMany({ userId }),
    AiUsage.deleteMany({ userId }),
    AiProposal.deleteMany({ userId }),
  ])
  const gone = await User.findOne({ _id: userId }, { email: 1 })
  if (gone) { await removeAllFor(userId, gone.email); await removeAllSharingFor(userId, gone.email) }
  await User.deleteOne({ _id: userId })
  return { records: results.reduce((n, r) => n + (r.deletedCount ?? 0), 0), files: files.length }
}
