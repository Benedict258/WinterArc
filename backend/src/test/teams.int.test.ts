import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { ThreadMember } from '../models/ThreadMember'
import { User } from '../models/User'
import { PushSubscription } from '../models/PushSubscription'
import { setPushSender } from '../services/notificationService'
import { generateToday } from '../services/dailyGenerationService'

const available = await dbReachable()
type Actor = Awaited<ReturnType<typeof signedUpAgent>>

describe.skipIf(!available)('shared threads', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let n = 0
  const person = (label: string, opts: { verify?: boolean } = {}) => signedUpAgent(ctx, `${label}${++n}@example.com`, opts)
  const mail = (to: string) => ctx.outbox.filter(m => m.to === to && /shared a thread/.test(m.subject))

  /** An owner with a shared thread, an editor and a viewer who have both joined. */
  async function team() {
    const owner = await person('owner'), editor = await person('editor'), viewer = await person('viewer')
    const thread = (await owner.agent.post('/api/threads').send({ name: 'Launch', category: 'Active Build', frequency: 'daily' })).body
    const join = async (who: Actor, role: 'editor' | 'viewer') => {
      await owner.agent.post(`/api/teams/${thread._id}/members`).send({ email: who.email, role })
      const inv = (await who.agent.get('/api/teams/overview')).body.invites[0]
      await who.agent.post(`/api/teams/invitations/${inv.id}/respond`).send({ action: 'accept' })
    }
    await join(editor, 'editor')
    await join(viewer, 'viewer')
    return { owner, editor, viewer, tid: thread._id as string }
  }
  const addTask = (a: Actor, tid: string, body: object) => a.agent.post(`/api/teams/${tid}/tasks`).send(body)
  const tasksOf = async (a: Actor, tid: string) => (await a.agent.get(`/api/teams/${tid}/tasks`)).body

  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { setPushSender(null); await ctx.stop() })
  afterEach(() => setPushSender(null))

  it('needs a confirmed email', async () => {
    const u = await person('unverified', { verify: false })
    expect((await u.agent.get('/api/teams/overview')).status).toBe(403)
    expect((await request(ctx.app).get('/api/teams/overview')).status).toBe(401)
  })

  it('invite → email and request → accept; the owner chooses roles; answers do not reveal who has an account', async () => {
    const owner = await person('o'), b = await person('b')
    const tid = (await owner.agent.post('/api/threads').send({ name: 'Book club', frequency: 'weekly' })).body._id
    const known = await owner.agent.post(`/api/teams/${tid}/members`).send({ email: b.email, role: 'editor' })
    const stranger = `new${++n}@example.com`
    const unknown = await owner.agent.post(`/api/teams/${tid}/members`).send({ email: stranger, role: 'viewer' })
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(mail(b.email)[0].text).toMatch(/invited you to work on the shared thread “Book club”/)
    expect(mail(stranger)[0].text).toMatch(/invite code/)

    const invites = (await b.agent.get('/api/teams/overview')).body.invites
    expect(invites).toEqual([expect.objectContaining({ threadName: 'Book club', role: 'editor' })])
    // not for anyone else
    const other = await person('c')
    expect((await other.agent.post(`/api/teams/invitations/${invites[0].id}/respond`).send({ action: 'accept' })).status).toBe(404)
    expect((await other.agent.get(`/api/teams/${tid}`)).status).toBe(404)
    await b.agent.post(`/api/teams/invitations/${invites[0].id}/respond`).send({ action: 'accept' })
    const view = (await b.agent.get(`/api/teams/${tid}`)).body
    expect(view.role).toBe('editor')
    expect(view.members.map((m: any) => m.role)).toEqual(['owner', 'editor']) // pending invitations are the owner's business
    expect((await owner.agent.get(`/api/teams/${tid}`)).body.members.map((m: any) => `${m.role}:${m.status}`)).toEqual(['owner:active', 'editor:active', 'viewer:pending'])
    // a newcomer with that email finds the invitation after signing up
    const newbie = await signedUpAgent(ctx, stranger)
    expect((await newbie.agent.get('/api/teams/overview')).body.invites).toHaveLength(1)
    // inviting again changes nothing
    await owner.agent.post(`/api/teams/${tid}/members`).send({ email: b.email, role: 'viewer' })
    expect(await ThreadMember.countDocuments({ threadId: tid })).toBe(2)
  })

  it('only the owner manages sharing', async () => {
    const { owner, editor, viewer, tid } = await team()
    const stranger = await person('x')
    for (const who of [editor, viewer]) {
      expect((await who.agent.post(`/api/teams/${tid}/members`).send({ email: stranger.email, role: 'viewer' })).status).toBe(403)
    }
    const members = (await owner.agent.get(`/api/teams/${tid}`)).body.members
    const editorRow = members.find((m: any) => m.role === 'editor')
    expect((await editor.agent.put(`/api/teams/${tid}/members/${editorRow.id}`).send({ role: 'viewer' })).status).toBe(403)
    expect((await owner.agent.put(`/api/teams/${tid}/members/${editorRow.id}`).send({ role: 'viewer' })).status).toBe(200)
    expect((await addTask(editor, tid, { title: 'now read-only' })).status).toBe(403)
    expect((await owner.agent.put(`/api/teams/${tid}/members/${editorRow.id}`).send({ role: 'editor' })).status).toBe(200)
    expect((await addTask(editor, tid, { title: 'editor again' })).status).toBe(201)
    expect((await stranger.agent.get(`/api/teams/${tid}/tasks`)).status).toBe(404)
  })

  it('team tasks are shared without leaking anyone’s plan; assigned work lands in the assignee’s own list', async () => {
    const { owner, editor, viewer, tid } = await team()
    const sent: string[] = []
    process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
    await PushSubscription.create({ userId: owner.userId, endpoint: 'https://push.example/owner', keys: { p256dh: 'k', auth: 'a' } })
    setPushSender(async (_s, body) => { sent.push(JSON.parse(body).title) })

    // the editor gives the owner a task, and takes one themself
    const forOwner = await addTask(editor, tid, { title: 'Write the announcement', assigneeId: owner.userId, dueDate: '2026-11-01', priority: 'high' })
    expect(forOwner.status).toBe(201)
    await addTask(editor, tid, { title: 'Prepare the demo' })
    expect(sent).toEqual(['New task for you'])
    const mine = (await owner.agent.get('/api/tasks')).body
    expect(mine.map((t: any) => t.title)).toEqual(['Write the announcement'])
    expect(String(mine[0].threadId)).toBe(tid)
    expect(await Task.countDocuments({ userId: editor.userId, title: 'Prepare the demo' })).toBe(1)

    // the owner plans their own day privately
    await Task.updateOne({ _id: mine[0]._id, userId: owner.userId }, { $set: { date: new Date('2026-10-14T00:00:00Z'), timeBlock: 'evening' } })

    for (const who of [owner, editor, viewer]) {
      const view = await tasksOf(who, tid)
      expect(view.tasks.map((t: any) => t.title).sort()).toEqual(['Prepare the demo', 'Write the announcement'])
      const t = view.tasks.find((x: any) => x.title === 'Write the announcement')
      expect(t).toMatchObject({ dueDate: '2026-11-01', priority: 'high', status: 'pending' })
      expect(t.date).toBeUndefined()
      expect(t.timeBlock).toBeUndefined()
      expect(t.assignee.you).toBe(who === owner)
    }
    expect((await addTask(viewer, tid, { title: 'viewers cannot add' })).status).toBe(403)
    expect((await addTask(editor, tid, { title: 'x', assigneeId: (await person('out')).userId })).status).toBe(400)
  })

  it('who may change what', async () => {
    const { owner, editor, viewer, tid } = await team()
    const ownersTask = (await owner.agent.post('/api/tasks').send({ title: 'Owner’s own', threadId: tid })).body._id
    const forEditor = await addTask(owner, tid, { title: 'For the editor', assigneeId: editor.userId })
    const editorTask = forEditor.body.id
    const editorsOwn = (await addTask(editor, tid, { title: 'Editor’s own' })).body.id
    const put = (a: Actor, id: string, body: object) => a.agent.put(`/api/teams/${tid}/tasks/${id}`).send(body)

    expect((await put(editor, ownersTask, { status: 'done' })).status).toBe(403) // someone else's
    expect((await put(editor, editorTask, { status: 'done' })).status).toBe(200) // assigned to them
    expect((await Task.findOne({ _id: editorTask, userId: editor.userId }))!.completedAt).toBeTruthy()
    expect((await put(editor, editorTask, { status: 'pending' })).status).toBe(200)
    expect((await Task.findOne({ _id: editorTask, userId: editor.userId }))!.completedAt).toBeNull()
    expect((await put(owner, editorsOwn, { title: 'Owner renamed it' })).status).toBe(200) // the owner can edit anything
    expect((await put(viewer, editorTask, { status: 'done' })).status).toBe(403)

    // reassigning: only the owner or the creator; the task leaves the old person's plan
    await Task.updateOne({ _id: editorTask, userId: editor.userId }, { $set: { date: new Date('2026-10-14T00:00:00Z'), timeBlock: 'morning' } })
    expect((await put(editor, editorTask, { assigneeId: owner.userId })).status).toBe(403) // assignee but not creator
    expect((await put(owner, editorTask, { assigneeId: owner.userId })).status).toBe(200)
    const moved = await Task.findOne({ _id: editorTask, userId: owner.userId })
    expect(moved).toMatchObject({ timeBlock: 'unscheduled', date: null })
    expect(await Task.exists({ _id: editorTask, userId: editor.userId })).toBeNull()
    expect((await put(owner, editorTask, { assigneeId: viewer.userId })).status).toBe(200) // viewers can be given work to follow? no — they are members
    expect((await put(owner, editorTask, { assigneeId: (await person('nobody')).userId })).status).toBe(400)
    expect((await put(owner, editorTask, {})).status).toBe(400)

    expect((await put(owner, 'nope', { status: 'done' })).status).toBe(404)
    expect((await editor.agent.delete(`/api/teams/${tid}/tasks/${ownersTask}`)).status).toBe(403)
    expect((await editor.agent.delete(`/api/teams/${tid}/tasks/${editorsOwn}`)).status).toBe(200)
    expect((await owner.agent.delete(`/api/teams/${tid}/tasks/${ownersTask}`)).status).toBe(200)
  })

  it('refuses a stale edit instead of overwriting someone else’s change', async () => {
    const { owner, editor, tid } = await team()
    const id = (await addTask(owner, tid, { title: 'Shared plan', assigneeId: editor.userId })).body.id
    const first = (await tasksOf(editor, tid)).tasks[0]
    // the owner edits first
    expect((await owner.agent.put(`/api/teams/${tid}/tasks/${id}`).send({ title: 'Shared plan v2', expectedUpdatedAt: first.updatedAt })).status).toBe(200)
    // the editor still has the old copy
    const stale = await editor.agent.put(`/api/teams/${tid}/tasks/${id}`).send({ title: 'my edit', expectedUpdatedAt: first.updatedAt })
    expect(stale.status).toBe(409)
    expect(stale.body.task.title).toBe('Shared plan v2')
    expect((await Task.findOne({ _id: id, userId: editor.userId }))!.title).toBe('Shared plan v2')
    const fresh = (await tasksOf(editor, tid)).tasks[0]
    expect((await editor.agent.put(`/api/teams/${tid}/tasks/${id}`).send({ title: 'my edit', expectedUpdatedAt: fresh.updatedAt })).status).toBe(200)
  })

  it('shared threads show up in a member’s thread list with their role, without notes, and vanish when archived', async () => {
    const { owner, editor, viewer, tid } = await team()
    await owner.agent.put(`/api/threads/${tid}`).send({ notes: 'private plans for the owner' })
    for (const [who, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) {
      const list = (await who.agent.get('/api/threads')).body
      const shared = list.find((t: any) => t._id === tid)
      expect(shared).toMatchObject({ name: 'Launch', sharedWithMe: true, role })
      expect(shared.notes).toBe('')
      expect(shared.ownerName).toMatch(/^owner/)
    }
    // members cannot change or delete the owner's thread
    expect((await editor.agent.put(`/api/threads/${tid}`).send({ name: 'hijacked' })).status).toBe(404)
    await editor.agent.delete(`/api/threads/${tid}`) // answers ok, but only ever touches the caller's own threads
    expect((await Thread.findOne({ _id: tid, userId: owner.userId }))!.status).toBe('active')
    expect((await owner.agent.get('/api/threads')).body.find((t: any) => t._id === tid).sharedWithMe).toBeUndefined()
    await owner.agent.delete(`/api/threads/${tid}`) // archive
    expect((await editor.agent.get('/api/threads')).body.find((t: any) => t._id === tid)).toBeUndefined()
  })

  it('editors can attach their own tasks to the thread through the normal task routes; viewers and strangers cannot', async () => {
    const { editor, viewer, tid } = await team()
    const stranger = await person('s')
    expect((await editor.agent.post('/api/tasks').send({ title: 'mine', threadId: tid })).status).toBe(201)
    expect((await viewer.agent.post('/api/tasks').send({ title: 'nope', threadId: tid })).status).toBe(400)
    expect((await stranger.agent.post('/api/tasks').send({ title: 'nope', threadId: tid })).status).toBe(400)
  })

  it('leaving or being removed ends access; your own tasks stay with you, outside the thread', async () => {
    const { owner, editor, viewer, tid } = await team()
    await addTask(editor, tid, { title: 'Editor keeps this' })
    const rows = (await owner.agent.get(`/api/teams/${tid}`)).body.members
    const viewerRow = rows.find((m: any) => m.role === 'viewer')
    const editorRow = rows.find((m: any) => m.role === 'editor')
    expect((await viewer.agent.delete(`/api/teams/${tid}/members/${editorRow.id}`)).status).toBe(403) // not theirs to remove
    expect((await viewer.agent.delete(`/api/teams/${tid}/members/${viewerRow.id}`)).status).toBe(200) // leaving
    expect((await viewer.agent.get(`/api/teams/${tid}/tasks`)).status).toBe(404)
    expect((await owner.agent.delete(`/api/teams/${tid}/members/${editorRow.id}`)).status).toBe(200)
    expect((await editor.agent.get(`/api/teams/${tid}`)).status).toBe(404)
    const kept = await Task.findOne({ userId: editor.userId, title: 'Editor keeps this' })
    expect(kept!.threadId).toBeNull()
    expect((await owner.agent.delete(`/api/teams/${tid}/members/${editorRow.id}`)).status).toBe(404)
  })

  it('deleting accounts: an owner’s thread goes, members keep their tasks; a member’s tasks go with them', async () => {
    const { owner, editor, tid } = await team()
    await addTask(owner, tid, { title: 'Assigned to the editor', assigneeId: editor.userId })
    await addTask(editor, tid, { title: 'Editor own task' })
    const leaver = await person('leaver')
    await owner.agent.post(`/api/teams/${tid}/members`).send({ email: leaver.email, role: 'editor' })
    await leaver.agent.post(`/api/teams/invitations/${(await leaver.agent.get('/api/teams/overview')).body.invites[0].id}/respond`).send({ action: 'accept' })
    await addTask(leaver, tid, { title: 'Leaver task' })

    await leaver.agent.post('/api/account/delete').send({ confirmEmail: leaver.email, password: 'correct horse battery' })
    expect(await Task.countDocuments({ userId: leaver.userId })).toBe(0)
    expect(await ThreadMember.countDocuments({ userId: leaver.userId })).toBe(0)
    expect((await tasksOf(owner, tid)).tasks.map((t: any) => t.title)).not.toContain('Leaver task')

    await User.updateOne({ _id: owner.userId }, { $set: { role: 'user' } })
    await owner.agent.post('/api/account/delete').send({ confirmEmail: owner.email, password: 'correct horse battery' })
    expect(await Thread.exists({ _id: tid }).setOptions({ crossUser: true })).toBeNull()
    expect(await ThreadMember.countDocuments({ threadId: tid })).toBe(0)
    const mine = await Task.find({ userId: editor.userId, title: { $in: ['Assigned to the editor', 'Editor own task'] } })
    expect(mine).toHaveLength(2)
    expect(mine.every(t => t.threadId === null)).toBe(true)
  })

  it('an unfinished shared task with no day is ordinary backlog to the member’s own planner', async () => {
    const { owner, editor, tid } = await team()
    await addTask(owner, tid, { title: 'Pick this up', assigneeId: editor.userId })
    await generateToday(editor.userId, '2026-10-05')
    const placed = await Task.findOne({ userId: editor.userId, title: 'Pick this up' })
    expect(placed!.date).toEqual(new Date('2026-10-05T00:00:00.000Z'))
    expect(String(placed!.threadId)).toBe(tid) // still part of the shared thread
  })

  it('limits how many people an owner can bring in, per plan', async () => {
    const owner = await person('big')
    const tid = (await owner.agent.post('/api/threads').send({ name: 'Crowd', frequency: 'weekly' })).body._id
    for (let i = 0; i < 5; i++) expect((await owner.agent.post(`/api/teams/${tid}/members`).send({ email: `crowd${n}x${i}@example.com`, role: 'viewer' })).status).toBe(200)
    const over = await owner.agent.post(`/api/teams/${tid}/members`).send({ email: `crowd${n}x9@example.com`, role: 'viewer' })
    expect(over.status).toBe(403)
    expect(over.body.error).toMatch(/allows 5 people/)
    expect((await owner.agent.post(`/api/teams/${tid}/members`).send({ email: 'bad', role: 'viewer' })).status).toBe(400)
    expect((await owner.agent.post(`/api/teams/${tid}/members`).send({ email: owner.email, role: 'viewer' })).status).toBe(400)
  })
})
