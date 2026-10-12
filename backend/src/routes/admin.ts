import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { User } from '../models/User'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { DropItem } from '../models/DropItem'
import { InviteCode } from '../models/InviteCode'
import { ApiToken } from '../models/ApiToken'
import { AuditLog } from '../models/AuditLog'
import { deleteAccount } from '../services/accountService'
import { inviteCodeString } from '../utils/tokens'

// Mounted behind requireAdmin (see server.ts)
export const adminRouter = Router()

const DAY = 86_400_000
const objectId = /^[0-9a-f]{24}$/

const audit = (adminId: string, action: string, targetUserId: string | null, detail = '') =>
  AuditLog.create({ adminId, action, targetUserId, detail })

adminRouter.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 7 * DAY)
  const [total, active, suspended, verified, signups7d, seen7d, codes] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'suspended' }),
    User.countDocuments({ emailVerifiedAt: { $ne: null } }),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ lastSeenAt: { $gte: since } }),
    InviteCode.find({}),
  ])
  const now = new Date()
  const open = codes.filter(c => !c.revokedAt && c.remaining > 0 && (!c.expiresAt || c.expiresAt > now))
  res.json({ users: { total, active, suspended, verified, signups7d, active7d: seen7d }, invites: { open: open.length, seatsLeft: open.reduce((n, c) => n + c.remaining, 0) } })
})

const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
}).strict()

adminRouter.get('/users', async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' })
  const page = parsed.data.page ?? 1
  const limit = 25
  const q = parsed.data.q
  const filter = q ? { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ])
  const ids = users.map(u => u._id)
  const crossUser = { crossUser: true }
  const [tasks, threads, drop] = await Promise.all([
    Task.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).option(crossUser),
    Thread.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).option(crossUser),
    DropItem.aggregate([{ $match: { userId: { $in: ids }, type: 'file' } }, { $group: { _id: '$userId', bytes: { $sum: '$fileSize' } } }]).option(crossUser),
  ])
  const by = (rows: any[], key: string) => new Map(rows.map(r => [String(r._id), r[key] as number]))
  const t = by(tasks, 'n'), th = by(threads, 'n'), d = by(drop, 'bytes')
  res.json({
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    users: users.map(u => ({
      id: String(u._id), email: u.email, name: u.name, role: u.role, status: u.status, emailVerified: !!u.emailVerifiedAt,
      createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, tasks: t.get(String(u._id)) ?? 0, threads: th.get(String(u._id)) ?? 0, dropBytes: d.get(String(u._id)) ?? 0,
    })),
  })
})

/** Another person's account, not an admin's: admins can't be suspended or deleted from here. */
async function target(id: string, adminId: string) {
  if (!objectId.test(id)) return { error: 'Invalid user' as const }
  if (id === adminId) return { error: 'You can’t do that to your own account.' as const }
  const user = await User.findOne({ _id: id })
  if (!user) return { error: 'User not found' as const }
  if (user.role === 'admin') return { error: 'Admin accounts can’t be changed here.' as const }
  return { user }
}

async function setStatus(req: any, res: any, status: 'active' | 'suspended') {
  const found = await target(req.params.id, uid(req))
  if ('error' in found) return res.status(found.error === 'User not found' ? 404 : 400).json({ error: found.error })
  // bumping the session version signs them out of every device at once
  await User.updateOne({ _id: found.user._id }, { $set: { status }, $inc: { sessionVersion: 1 } })
  if (status === 'suspended') await ApiToken.deleteMany({ userId: found.user._id })
  await audit(uid(req), status === 'suspended' ? 'suspend' : 'unsuspend', req.params.id)
  res.json({ ok: true })
}
adminRouter.post('/users/:id/suspend', (req, res) => setStatus(req, res, 'suspended'))
adminRouter.post('/users/:id/unsuspend', (req, res) => setStatus(req, res, 'active'))

adminRouter.delete('/users/:id', async (req, res) => {
  const found = await target(req.params.id, uid(req))
  if ('error' in found) return res.status(found.error === 'User not found' ? 404 : 400).json({ error: found.error })
  try {
    const summary = await deleteAccount(req.params.id)
    await audit(uid(req), 'delete', req.params.id, `${summary.records} records, ${summary.files} files`)
    res.json({ ok: true, ...summary })
  } catch (error) {
    console.error('Admin deletion failed:', error instanceof Error ? error.message : error)
    res.status(500).json({ error: 'Deletion failed; try again.' })
  }
})

adminRouter.get('/invites', async (_req, res) => {
  const codes = await InviteCode.find({}).sort({ createdAt: -1 }).limit(200)
  res.json(codes.map(c => ({
    id: String(c._id), code: c.code, note: c.note, maxUses: c.maxUses, remaining: c.remaining, expiresAt: c.expiresAt, revokedAt: c.revokedAt, createdAt: c.createdAt,
  })))
})

const inviteSchema = z.object({
  count: z.number().int().min(1).max(50),
  uses: z.number().int().min(1).max(1000),
  days: z.number().int().min(0).max(365),
  note: z.string().trim().max(120).optional(),
})
adminRouter.post('/invites', validateRequest(inviteSchema), async (req, res) => {
  const { count, uses, days, note } = req.body
  const created = []
  for (let i = 0; i < count; i++) {
    created.push(await InviteCode.create({
      code: inviteCodeString(), maxUses: uses, remaining: uses, note: note ?? '', createdBy: uid(req),
      expiresAt: days > 0 ? new Date(Date.now() + days * DAY) : null,
    }))
  }
  await audit(uid(req), 'invites.create', null, `${count} code(s), ${uses} use(s) each`)
  res.status(201).json(created.map(c => ({ id: String(c._id), code: c.code })))
})

adminRouter.post('/invites/:id/revoke', async (req, res) => {
  if (!objectId.test(req.params.id)) return res.status(400).json({ error: 'Invalid code' })
  const done = await InviteCode.updateOne({ _id: req.params.id, revokedAt: null }, { $set: { revokedAt: new Date() } })
  if (!done.matchedCount) return res.status(404).json({ error: 'Code not found or already revoked' })
  await audit(uid(req), 'invites.revoke', null, req.params.id)
  res.json({ ok: true })
})

adminRouter.get('/audit', async (_req, res) => {
  const rows = await AuditLog.find({}).sort({ createdAt: -1 }).limit(50)
  res.json(rows.map(r => ({ id: String(r._id), action: r.action, adminId: String(r.adminId), targetUserId: r.targetUserId ? String(r.targetUserId) : null, detail: r.detail, createdAt: r.createdAt })))
})
