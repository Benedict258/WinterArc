import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { User } from '../models/User'
import { ThreadMember } from '../models/ThreadMember'
import { getPlan } from './planService'
import { sendEmail, threadInviteMessage } from './emailService'
import { markNotificationsDirty, sendToUser } from './notificationService'

export class SharedError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message) }
}

export type Role = 'owner' | 'editor' | 'viewer'
const DAY_MS = 86_400_000
const MAX_INVITES_PER_DAY = 20
const objectId = /^[0-9a-f]{24}$/i

const shortName = (u: { name?: string | null; email: string }) => u.name?.trim() || u.email.split('@')[0]

/**
 * The person's standing in a thread: owner, active member, or nothing (null). Everything else in this
 * file starts here, so a thread's data is never read for someone who isn't part of it.
 */
export async function access(userId: string, threadId: string): Promise<{ thread: any; role: Role } | null> {
  if (!objectId.test(threadId)) return null
  const thread = await Thread.findOne({ _id: threadId }).setOptions({ crossUser: true })
  if (!thread) return null
  if (String(thread.userId) === userId) return { thread, role: 'owner' }
  const member = await ThreadMember.findOne({ threadId, userId, status: 'active' })
  return member ? { thread, role: member.role as Role } : null
}

/** May this person attach their own tasks to the thread? True for its owner and for editors. */
export async function canAttachTasks(userId: string, threadId: string) {
  const a = await access(userId, threadId)
  return !!a && a.role !== 'viewer'
}

async function need(userId: string, threadId: string, level: 'member' | 'editor' | 'owner' = 'member') {
  const a = await access(userId, threadId)
  if (!a) throw new SharedError(404, 'Thread not found')
  if (level === 'owner' && a.role !== 'owner') throw new SharedError(403, 'Only the thread’s owner can do that.')
  if (level === 'editor' && a.role === 'viewer') throw new SharedError(403, 'You can view this thread but not change it.')
  return a
}

// ------------------------------------------------------------- listing

/** Threads other people share with me, shaped like my own threads plus who owns them and what I may do. */
export async function threadsSharedWithMe(userId: string) {
  const memberships = await ThreadMember.find({ userId, status: 'active' })
  if (!memberships.length) return []
  const threads = await Thread.find({ _id: { $in: memberships.map(m => m.threadId) }, status: { $ne: 'archived' } }).setOptions({ crossUser: true })
  const owners = await User.find({ _id: { $in: threads.map(t => t.userId) } }, { name: 1, email: 1 })
  const ownerName = new Map(owners.map(o => [String(o._id), shortName(o)]))
  const roleOf = new Map(memberships.map(m => [String(m.threadId), m.role]))
  return threads.map(t => ({
    ...t.toObject(), notes: '', resources: [],
    sharedWithMe: true, role: roleOf.get(String(t._id)), ownerName: ownerName.get(String(t.userId)) ?? 'Someone',
  }))
}

export async function mySharedThreads(userId: string) {
  const mine = await ThreadMember.find({ ownerId: userId })
  const ids = [...new Set(mine.map(m => String(m.threadId)))]
  if (!ids.length) return []
  const threads = await Thread.find({ _id: { $in: ids }, userId, status: { $ne: 'archived' } }, { name: 1 })
  return threads.map(t => ({ id: String(t._id), name: t.name, members: mine.filter(m => String(m.threadId) === String(t._id) && m.status === 'active').length }))
}

/** Invitations waiting for me (sent to my account or to my confirmed email address). */
export async function pendingInvites(userId: string) {
  const me = await User.findOne({ _id: userId }, { email: 1, emailVerifiedAt: 1 })
  if (!me) return []
  const byEmail = me.emailVerifiedAt ? [{ inviteeEmail: me.email, userId: null }] : []
  const rows = await ThreadMember.find({ status: 'pending', $or: [{ userId }, ...byEmail] })
  const out = []
  for (const r of rows) {
    const [thread, owner] = await Promise.all([
      Thread.findOne({ _id: r.threadId, status: { $ne: 'archived' } }, { name: 1 }).setOptions({ crossUser: true }),
      User.findOne({ _id: r.ownerId }, { name: 1, email: 1 }),
    ])
    if (thread && owner) out.push({ id: String(r._id), threadName: thread.name, from: shortName(owner), role: r.role })
  }
  return out
}

export async function listMembers(userId: string, threadId: string) {
  const { thread, role } = await need(userId, threadId)
  const rows = await ThreadMember.find({ threadId })
  const people = await User.find({ _id: { $in: [thread.userId, ...rows.map(r => r.userId).filter(Boolean)] } }, { name: 1, email: 1 })
  const byId = new Map(people.map(p => [String(p._id), p]))
  const members = [
    { id: 'owner', userId: String(thread.userId), name: shortName(byId.get(String(thread.userId)) ?? { email: 'owner@' }), role: 'owner' as Role, status: 'active', you: String(thread.userId) === userId },
    ...rows.filter(r => r.status === 'active' || role === 'owner').map(r => ({
      id: String(r._id), userId: r.userId ? String(r.userId) : null,
      name: r.status === 'active' && r.userId ? shortName(byId.get(String(r.userId)) ?? { email: r.inviteeEmail }) : r.inviteeEmail,
      role: r.role as Role, status: r.status, you: !!r.userId && String(r.userId) === userId,
    })),
  ]
  return { thread: { id: String(thread._id), name: thread.name, status: thread.status }, role, members }
}

// ------------------------------------------------------------- membership

export async function invite(ownerId: string, threadId: string, rawEmail: string, role: 'editor' | 'viewer') {
  const { thread } = await need(ownerId, threadId, 'owner')
  if (thread.status === 'archived') throw new SharedError(400, 'Archived threads can’t be shared.')
  const email = rawEmail.trim().toLowerCase()
  const me = await User.findOne({ _id: ownerId }, { name: 1, email: 1 })
  if (!me) throw new SharedError(404, 'Account not found')
  if (email === me.email) throw new SharedError(400, 'That’s your own email address.')

  const { limits } = await getPlan(ownerId)
  if ((await ThreadMember.countDocuments({ ownerId })) >= limits.maxSharedMembers) {
    throw new SharedError(403, `Your plan allows ${limits.maxSharedMembers} people across your shared threads, including pending invitations.`)
  }
  if ((await ThreadMember.countDocuments({ ownerId, createdAt: { $gt: new Date(Date.now() - DAY_MS) } })) >= MAX_INVITES_PER_DAY) {
    throw new SharedError(429, 'That’s the daily limit on invitations. Try again tomorrow.')
  }
  const target = await User.findOne({ email, status: 'active' }, { _id: 1 })
  const existing = await ThreadMember.findOne({ threadId, inviteeEmail: email })
  if (existing) return { ok: true } // same answer whether or not it already existed
  try {
    await ThreadMember.create({ threadId, ownerId, inviteeEmail: email, userId: target?._id ?? null, role })
  } catch (error: any) {
    if (error?.code !== 11000) throw error
    return { ok: true }
  }
  await sendEmail(threadInviteMessage(email, { name: me.name ?? '', email: me.email }, thread.name, role, !!target)).catch(err => console.error('Thread invite email failed:', err instanceof Error ? err.message : err))
  if (target) void sendToUser(String(target._id), { title: 'Thread shared with you', body: `${shortName(me)} invited you to “${thread.name}”.`, url: '/threads', tag: `share:${threadId}` }).catch(() => {})
  return { ok: true }
}

export async function respond(userId: string, memberId: string, action: 'accept' | 'decline') {
  if (!objectId.test(memberId)) throw new SharedError(404, 'Not found')
  const me = await User.findOne({ _id: userId }, { email: 1, emailVerifiedAt: 1 })
  const row = await ThreadMember.findOne({ _id: memberId, status: 'pending' })
  const mine = row && me && ((row.userId && String(row.userId) === userId) || (!row.userId && me.emailVerifiedAt && row.inviteeEmail === me.email))
  if (!row || !mine) throw new SharedError(404, 'Not found')
  if (action === 'decline') {
    await ThreadMember.deleteOne({ _id: row._id })
    return { ok: true }
  }
  await ThreadMember.updateOne({ _id: row._id, status: 'pending' }, { $set: { status: 'active', userId } })
  const thread = await Thread.findOne({ _id: row.threadId }, { name: 1 }).setOptions({ crossUser: true })
  void sendToUser(String(row.ownerId), { title: 'Invitation accepted', body: `${me ? shortName(me) : 'Someone'} joined “${thread?.name ?? 'your thread'}”.`, url: `/teams/${row.threadId}`, tag: `joined:${row._id}` }).catch(() => {})
  return { ok: true }
}

/** The owner removes someone (or withdraws an invitation); a member can remove themselves. Their own tasks stay with them, no longer in the thread. */
export async function removeMember(actorId: string, threadId: string, memberId: string) {
  const a = await need(actorId, threadId)
  if (!objectId.test(memberId)) throw new SharedError(404, 'Not found')
  const row = await ThreadMember.findOne({ _id: memberId, threadId })
  if (!row) throw new SharedError(404, 'Not found')
  const self = !!row.userId && String(row.userId) === actorId
  if (a.role !== 'owner' && !self) throw new SharedError(403, 'Only the thread’s owner can remove other people.')
  await ThreadMember.deleteOne({ _id: row._id })
  if (row.userId) await Task.updateMany({ userId: row.userId, threadId }, { $set: { threadId: null } })
  return { ok: true }
}

export async function setRole(ownerId: string, threadId: string, memberId: string, role: 'editor' | 'viewer') {
  await need(ownerId, threadId, 'owner')
  if (!objectId.test(memberId)) throw new SharedError(404, 'Not found')
  const done = await ThreadMember.updateOne({ _id: memberId, threadId }, { $set: { role } })
  if (!done.matchedCount) throw new SharedError(404, 'Not found')
  return { ok: true }
}

// ----------------------------------------------------------- team tasks

type Changes = { title?: string; dueDate?: string | null; status?: 'pending' | 'done'; priority?: 'low' | 'medium' | 'high'; intensity?: 'light' | 'medium' | 'heavy'; assigneeId?: string }

const day = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00.000Z`) : null)

/** Everyone in the thread, owner first, as the possible assignees. */
async function assignable(thread: any) {
  const rows = await ThreadMember.find({ threadId: thread._id, status: 'active' }, { userId: 1 })
  return new Set([String(thread.userId), ...rows.map(r => String(r.userId))])
}

/**
 * The thread's tasks as the team sees them: title, status, due date, priority and who has it. A person's planned day
 * and time block stay private to them.
 */
export async function teamTasks(userId: string, threadId: string) {
  const { thread, role } = await need(userId, threadId)
  const tasks = await Task.find({ threadId }).setOptions({ crossUser: true }).sort({ status: 1, dueDate: 1, createdAt: 1 }).limit(500)
  const people = await User.find({ _id: { $in: [...new Set(tasks.flatMap(t => [String(t.userId), t.createdBy ? String(t.createdBy) : '']).filter(Boolean))] } }, { name: 1, email: 1 })
  const byId = new Map(people.map(p => [String(p._id), p]))
  return {
    role,
    tasks: tasks.map(t => ({
      id: String(t._id), title: t.title, status: t.status, priority: t.priority, intensity: t.intensity,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      assignee: { id: String(t.userId), name: byId.get(String(t.userId)) ? shortName(byId.get(String(t.userId))!) : 'Former member', you: String(t.userId) === userId },
      createdBy: t.createdBy ? (byId.get(String(t.createdBy)) ? shortName(byId.get(String(t.createdBy))!) : null) : null,
      canEdit: role === 'owner' || String(t.userId) === userId || (!!t.createdBy && String(t.createdBy) === userId),
      updatedAt: t.updatedAt.toISOString(),
    })),
    ownerId: String(thread.userId),
  }
}

export async function createTeamTask(userId: string, threadId: string, input: Changes & { title: string }) {
  const { thread } = await need(userId, threadId, 'editor')
  if (thread.status === 'archived') throw new SharedError(400, 'This thread is archived.')
  const assignee = input.assigneeId ?? userId
  if (!(await assignable(thread)).has(assignee)) throw new SharedError(400, 'You can only assign tasks to people in the thread.')
  const task = await Task.create({
    userId: assignee, createdBy: assignee === userId ? null : userId, threadId, title: input.title,
    dueDate: day(input.dueDate), priority: input.priority ?? 'medium', intensity: input.intensity ?? 'medium',
    status: 'pending', source: 'manual', timeBlock: 'unscheduled', date: null,
  })
  if (assignee !== userId) {
    const me = await User.findOne({ _id: userId }, { name: 1, email: 1 })
    void sendToUser(assignee, { title: 'New task for you', body: `${me ? shortName(me) : 'Someone'} added “${input.title}” in “${thread.name}”.`, url: '/', tag: `assign:${task._id}` }).catch(() => {})
  }
  await markNotificationsDirty(assignee)
  return { id: String(task._id) }
}

/** Change a team task. Only its assignee, whoever created it, or the thread's owner may. A stale edit is refused (409) so nobody's change is silently lost. */
export async function updateTeamTask(userId: string, threadId: string, taskId: string, changes: Changes, expectedUpdatedAt?: string) {
  const { thread, role } = await need(userId, threadId, 'editor')
  if (!objectId.test(taskId)) throw new SharedError(404, 'Task not found')
  const task = await Task.findOne({ _id: taskId, threadId }).setOptions({ crossUser: true })
  if (!task) throw new SharedError(404, 'Task not found')
  const mineToEdit = role === 'owner' || String(task.userId) === userId || (!!task.createdBy && String(task.createdBy) === userId)
  if (!mineToEdit) throw new SharedError(403, 'You can only change tasks that are yours or that you created.')

  const set: Record<string, unknown> = {}
  if (changes.title !== undefined) set.title = changes.title
  if (changes.dueDate !== undefined) set.dueDate = day(changes.dueDate)
  if (changes.priority) set.priority = changes.priority
  if (changes.intensity) set.intensity = changes.intensity
  if (changes.status) { set.status = changes.status; set.completedAt = changes.status === 'done' ? new Date() : null }
  let reassigned: string | null = null
  if (changes.assigneeId && changes.assigneeId !== String(task.userId)) {
    const creatorOrOwner = role === 'owner' || (!!task.createdBy && String(task.createdBy) === userId)
    if (!creatorOrOwner) throw new SharedError(403, 'Only the thread’s owner or whoever created a task can reassign it.')
    if (!(await assignable(thread)).has(changes.assigneeId)) throw new SharedError(400, 'You can only assign tasks to people in the thread.')
    Object.assign(set, { userId: changes.assigneeId, date: null, timeBlock: 'unscheduled', scheduledBy: null, createdBy: task.createdBy ?? task.userId })
    reassigned = changes.assigneeId
  }
  if (!Object.keys(set).length) throw new SharedError(400, 'Nothing to change.')

  const filter: Record<string, unknown> = { _id: taskId, threadId }
  if (expectedUpdatedAt) filter.updatedAt = new Date(expectedUpdatedAt)
  const updated = await Task.findOneAndUpdate(filter, { $set: set }, { new: true }).setOptions({ crossUser: true })
  if (!updated) {
    const current = await teamTasks(userId, threadId)
    throw new SharedError(409, 'Someone else changed this task. The latest version is shown; try again.', { task: current.tasks.find(t => t.id === taskId) ?? null })
  }
  if (reassigned) {
    const me = await User.findOne({ _id: userId }, { name: 1, email: 1 })
    void sendToUser(reassigned, { title: 'Task assigned to you', body: `${me ? shortName(me) : 'Someone'} gave you “${updated.title}” in “${thread.name}”.`, url: '/', tag: `assign:${taskId}` }).catch(() => {})
    await markNotificationsDirty(reassigned)
  }
  return { ok: true, updatedAt: updated.updatedAt.toISOString() }
}

export async function deleteTeamTask(userId: string, threadId: string, taskId: string) {
  const { role } = await need(userId, threadId, 'editor')
  if (!objectId.test(taskId)) throw new SharedError(404, 'Task not found')
  const task = await Task.findOne({ _id: taskId, threadId }).setOptions({ crossUser: true })
  if (!task) throw new SharedError(404, 'Task not found')
  if (!(role === 'owner' || String(task.userId) === userId || (!!task.createdBy && String(task.createdBy) === userId))) {
    throw new SharedError(403, 'You can only delete tasks that are yours or that you created.')
  }
  await Task.deleteOne({ _id: taskId, userId: task.userId })
  return { ok: true }
}

/** Account deletion: unshare what I own (members keep their tasks, no longer in the thread) and leave what I joined. */
export async function removeAllSharingFor(userId: string, email: string) {
  const owned = await ThreadMember.find({ ownerId: userId }, { threadId: 1 })
  const threadIds = [...new Set(owned.map(o => o.threadId))]
  if (threadIds.length) await Task.updateMany({ threadId: { $in: threadIds }, userId: { $ne: userId } }, { $set: { threadId: null } }).setOptions({ crossUser: true })
  await ThreadMember.deleteMany({ $or: [{ ownerId: userId }, { userId }, { inviteeEmail: email, status: 'pending' }] })
}
