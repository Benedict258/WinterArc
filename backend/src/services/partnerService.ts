import { Connection } from '../models/Connection'
import { User } from '../models/User'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { Settings } from '../models/Settings'
import { computeStreak, completionStats } from './analyticsService'
import { addDaysKey, dateToDayKey, dayKeyToDate, toDayKey, weekStartKey, DEFAULT_TIMEZONE } from './dailyGenerationService'
import { getPlan } from './planService'
import { sendEmail, partnerInviteMessage } from './emailService'
import { sendToUser } from './notificationService'

export class PartnerError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export type Shares = { streak: boolean; weekProgress: boolean; threads: boolean; taskTitles: boolean }
const SHARE_KEYS: (keyof Shares)[] = ['streak', 'weekProgress', 'threads', 'taskTitles']
const MAX_INVITES_PER_DAY = 10
const MAX_CHEERS_PER_DAY = 3
const DAY_MS = 86_400_000

const toShares = (s: any): Shares => Object.fromEntries(SHARE_KEYS.map(k => [k, !!s?.[k]])) as Shares

const label = (u: { name?: string | null; email: string }) => u.name?.trim() || u.email

/** The connections I am part of: I sent it, it was addressed to me, or it was sent to my confirmed email. */
async function mine(userId: string) {
  const me = await User.findOne({ _id: userId }, { email: 1, emailVerifiedAt: 1 })
  if (!me) return { me: null, rows: [] as any[] }
  const byEmail = me.emailVerifiedAt ? [{ inviteeEmail: me.email, addresseeId: null }] : []
  const rows = await Connection.find({ $or: [{ requesterId: userId }, { addresseeId: userId }, ...byEmail] })
  return { me, rows }
}

const sideOf = (c: any, userId: string): 'requester' | 'addressee' => (String(c.requesterId) === userId ? 'requester' : 'addressee')

async function nameOf(id: unknown) {
  const u = await User.findOne({ _id: id }, { name: 1, email: 1 })
  return u ? label(u) : 'Someone'
}

/** Everything the partners screen shows: partners, requests to me, requests I sent. */
export async function listPartners(userId: string) {
  const { rows } = await mine(userId)
  const out = { partners: [] as any[], incoming: [] as any[], outgoing: [] as any[] }
  for (const c of rows) {
    const side = sideOf(c, userId)
    if (c.status === 'blocked' || c.status === 'declined') continue
    if (c.status === 'accepted') {
      const otherId = side === 'requester' ? c.addresseeId : c.requesterId
      const other = await User.findOne({ _id: otherId }, { name: 1, email: 1 })
      out.partners.push({
        id: String(c._id), name: other ? label(other) : 'Former member',
        youShare: toShares(side === 'requester' ? c.requesterShares : c.addresseeShares),
        theyShare: toShares(side === 'requester' ? c.addresseeShares : c.requesterShares),
      })
    } else if (side === 'requester') {
      out.outgoing.push({ id: String(c._id), email: c.inviteeEmail })
    } else {
      const from = await User.findOne({ _id: c.requesterId }, { name: 1, email: 1 })
      out.incoming.push({ id: String(c._id), from: from ? label(from) : 'Someone', fromEmail: from?.email })
    }
  }
  return out
}

/**
 * Invite someone by email. The answer never says whether they already have an account, so this can't be used to
 * find out who uses the app. An invite going the other way is simply accepted.
 */
export async function invite(userId: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase()
  const me = await User.findOne({ _id: userId }, { name: 1, email: 1 })
  if (!me) throw new PartnerError(404, 'Account not found')
  if (email === me.email) throw new PartnerError(400, 'That’s your own email address.')

  const { limits } = await getPlan(userId)
  const { rows } = await mine(userId)
  const active = rows.filter(c => c.status === 'accepted' || (c.status === 'pending' && sideOf(c, userId) === 'requester'))
  if (active.length >= limits.maxPartners) throw new PartnerError(403, `Your plan allows ${limits.maxPartners} partners including pending invitations.`)
  const today = await Connection.countDocuments({ requesterId: userId, createdAt: { $gt: new Date(Date.now() - DAY_MS) } })
  if (today >= MAX_INVITES_PER_DAY) throw new PartnerError(429, 'That’s the daily limit on invitations. Try again tomorrow.')

  const target = await User.findOne({ email, status: 'active' }, { _id: 1 })

  // They already invited me: accept it instead of making a second one
  if (target) {
    const reverse = await Connection.findOne({ requesterId: target._id, $or: [{ addresseeId: userId }, { inviteeEmail: me.email }], status: 'pending' })
    if (reverse) {
      await Connection.updateOne({ _id: reverse._id, status: 'pending' }, { $set: { status: 'accepted', addresseeId: userId } })
      return { ok: true }
    }
    const blocked = await Connection.exists({ requesterId: target._id, addresseeId: userId, status: 'blocked' })
    if (blocked) return { ok: true } // quietly nothing: they asked not to be contacted
  }

  const existing = await Connection.findOne({ requesterId: userId, inviteeEmail: email })
  if (existing) {
    if (existing.status === 'pending' || existing.status === 'accepted') return { ok: true }
    if (existing.status === 'blocked') return { ok: true }
    // declined earlier: let them ask again after a week
    if (Date.now() - existing.updatedAt.getTime() < 7 * DAY_MS) return { ok: true }
    await Connection.updateOne({ _id: existing._id }, { $set: { status: 'pending', addresseeId: target?._id ?? null } })
  } else {
    try {
      await Connection.create({ requesterId: userId, addresseeId: target?._id ?? null, inviteeEmail: email })
    } catch (error: any) {
      if (error?.code !== 11000) throw error
    }
  }
  await sendEmail(partnerInviteMessage(email, { name: me.name ?? '', email: me.email }, !!target)).catch(err => console.error('Partner invite email failed:', err instanceof Error ? err.message : err))
  if (target) void sendToUser(String(target._id), { title: 'Partner request', body: `${label(me)} would like to be your accountability partner.`, url: '/partners', tag: `partner:${userId}` }).catch(() => {})
  return { ok: true }
}

async function find(userId: string, id: string) {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new PartnerError(404, 'Not found')
  const { rows } = await mine(userId)
  const c = rows.find(r => String(r._id) === id)
  if (!c) throw new PartnerError(404, 'Not found')
  return c
}

/** Accept, decline (optionally blocking further requests), or cancel/remove. Only the invited person can accept or decline. */
export async function respond(userId: string, id: string, action: 'accept' | 'decline' | 'block') {
  const c = await find(userId, id)
  if (sideOf(c, userId) === 'requester' || c.status !== 'pending') throw new PartnerError(400, 'There’s nothing to respond to.')
  if (action === 'accept') {
    const { limits } = await getPlan(userId)
    const { rows } = await mine(userId)
    if (rows.filter(r => r.status === 'accepted').length >= limits.maxPartners) throw new PartnerError(403, `Your plan allows ${limits.maxPartners} partners.`)
    await Connection.updateOne({ _id: c._id, status: 'pending' }, { $set: { status: 'accepted', addresseeId: userId } })
    const who = await nameOf(userId)
    void sendToUser(String(c.requesterId), { title: 'Partner request accepted', body: `${who} is now your accountability partner.`, url: '/partners', tag: `partner-ok:${id}` }).catch(() => {})
  } else {
    await Connection.updateOne({ _id: c._id, status: 'pending' }, { $set: { status: action === 'block' ? 'blocked' : 'declined', addresseeId: userId } })
  }
  return { ok: true }
}

/** Either side can end a partnership, or the sender can withdraw a pending invitation. Removing deletes the record. */
export async function remove(userId: string, id: string) {
  const c = await find(userId, id)
  if (c.status === 'blocked' && sideOf(c, userId) === 'requester') throw new PartnerError(404, 'Not found')
  await Connection.deleteOne({ _id: c._id })
  return { ok: true }
}

/** What I share with this partner. Takes effect immediately; they only ever see what is ticked. */
export async function setSharing(userId: string, id: string, share: Partial<Shares>) {
  const c = await find(userId, id)
  if (c.status !== 'accepted') throw new PartnerError(400, 'Sharing starts once the request is accepted.')
  const field = sideOf(c, userId) === 'requester' ? 'requesterShares' : 'addresseeShares'
  const set: Record<string, boolean> = {}
  for (const k of SHARE_KEYS) if (typeof share[k] === 'boolean') set[`${field}.${k}`] = share[k]!
  if (Object.keys(set).length) await Connection.updateOne({ _id: c._id }, { $set: set })
  return { ok: true }
}

/** A partner's progress, limited to what they have chosen to share with me. */
export async function partnerProgress(userId: string, id: string, now = new Date()) {
  const c = await find(userId, id)
  if (c.status !== 'accepted') throw new PartnerError(404, 'Not found')
  const side = sideOf(c, userId)
  const otherId = String(side === 'requester' ? c.addresseeId : c.requesterId)
  const shares = toShares(side === 'requester' ? c.addresseeShares : c.requesterShares)
  const other = await User.findOne({ _id: otherId }, { name: 1, email: 1 })
  if (!other) throw new PartnerError(404, 'Not found')
  const settings = await Settings.findOne({ userId: otherId }, { timezone: 1 })
  const tz = settings?.timezone || DEFAULT_TIMEZONE
  const today = toDayKey(now, tz)
  const week = weekStartKey(today)

  const out: Record<string, unknown> = { name: label(other), shares }
  if (shares.streak) {
    const done = await Task.find({ userId: otherId, status: 'done', completedAt: { $gte: new Date(now.getTime() - 120 * DAY_MS) } }, { completedAt: 1 })
    out.streak = computeStreak(done.map(t => t.completedAt), tz, now)
  }
  const weekTasks = shares.weekProgress || shares.threads
    ? await Task.find({ userId: otherId, isEvent: { $ne: true }, date: { $gte: dayKeyToDate(week), $lt: dayKeyToDate(addDaysKey(week, 7)) } }, { status: 1, date: 1, threadId: 1 })
    : []
  if (shares.weekProgress) {
    const { completed, total } = completionStats(weekTasks)
    const perDay = Array.from({ length: 7 }, (_, i) => {
      const k = addDaysKey(week, i)
      const day = weekTasks.filter(t => t.date && dateToDayKey(new Date(t.date)) === k && t.status !== 'skipped')
      return { day: k, done: day.filter(t => t.status === 'done').length, total: day.length }
    })
    out.week = { completed, total, perDay }
  }
  if (shares.threads) {
    const threads = await Thread.find({ userId: otherId, status: 'active' }, { name: 1 })
    out.threads = threads.map(t => {
      const own = weekTasks.filter(w => String(w.threadId) === String(t._id) && w.status !== 'skipped')
      return { name: t.name, done: own.filter(w => w.status === 'done').length, total: own.length }
    })
  }
  if (shares.taskTitles) {
    const tasks = await Task.find({ userId: otherId, isEvent: { $ne: true }, date: { $gte: dayKeyToDate(today), $lt: dayKeyToDate(addDaysKey(today, 1)) } }, { title: 1, status: 1 }).limit(30)
    out.today = tasks.map(t => ({ title: t.title, done: t.status === 'done' }))
  }
  return out
}

/** A small push to say "keep going". At most a few a day per person. */
export async function cheer(userId: string, id: string, now = new Date()) {
  const c = await find(userId, id)
  if (c.status !== 'accepted') throw new PartnerError(400, 'You can cheer on partners once they’ve accepted.')
  const since = now.getTime() - DAY_MS
  if (c.cheers.filter((x: any) => String(x.by) === userId && new Date(x.at).getTime() > since).length >= MAX_CHEERS_PER_DAY) {
    throw new PartnerError(429, 'You’ve cheered a lot today. Give them a break!')
  }
  const otherId = String(sideOf(c, userId) === 'requester' ? c.addresseeId : c.requesterId)
  await Connection.updateOne({ _id: c._id }, { $push: { cheers: { $each: [{ by: userId, at: now }], $slice: -20 } } })
  const who = await nameOf(userId)
  await sendToUser(otherId, { title: `${who} is cheering you on`, body: 'Keep going — one task at a time.', url: '/', tag: `cheer:${id}` }).catch(() => {})
  return { ok: true }
}

/** Remove every partnership a person is part of (used when an account is deleted). */
export async function removeAllFor(userId: string, email: string) {
  await Connection.deleteMany({ $or: [{ requesterId: userId }, { addresseeId: userId }] })
  // invitations other people sent to this address are theirs, but without a person behind them they go too
  await Connection.deleteMany({ inviteeEmail: email, status: 'pending' })
}
