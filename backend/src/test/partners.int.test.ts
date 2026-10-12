import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Connection } from '../models/Connection'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { User } from '../models/User'
import { setPushSender } from '../services/notificationService'
import { PushSubscription } from '../models/PushSubscription'

const available = await dbReachable()
type Actor = Awaited<ReturnType<typeof signedUpAgent>>
const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)

describe.skipIf(!available)('accountability partners', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let n = 0
  const person = async (label: string, opts: { verify?: boolean } = {}) => signedUpAgent(ctx, `${label}${++n}@example.com`, opts)
  const invite = (a: Actor, email: string) => a.agent.post('/api/partners/invite').send({ email })
  const list = async (a: Actor) => (await a.agent.get('/api/partners')).body
  const mail = (to: string) => ctx.outbox.filter(m => m.to === to && /invited you to WinterArc/.test(m.subject))
  /** Two people who are already partners. */
  async function pair() {
    const a = await person('pa'), b = await person('pb')
    await invite(a, b.email)
    const id = (await list(b)).incoming[0].id
    await b.agent.post(`/api/partners/${id}/respond`).send({ action: 'accept' })
    return { a, b, id }
  }

  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { setPushSender(null); await ctx.stop() })
  afterEach(() => setPushSender(null))

  it('needs a confirmed email', async () => {
    const u = await person('unverified', { verify: false })
    expect((await u.agent.get('/api/partners')).status).toBe(403)
    expect((await request(ctx.app).get('/api/partners')).status).toBe(401)
  })

  it('invite → request appears for them → accept → both see the partnership with private defaults', async () => {
    const a = await person('alice'), b = await person('bob')
    const res = await invite(a, b.email)
    expect(res.body).toEqual({ ok: true })
    expect(mail(b.email)[0].text).toMatch(/asked you to be their accountability partner/)
    expect((await list(a)).outgoing).toEqual([expect.objectContaining({ email: b.email })])
    const incoming = (await list(b)).incoming
    expect(incoming).toHaveLength(1)
    expect(incoming[0].fromEmail).toBe(a.email)
    // inviting again does not duplicate or re-send
    await invite(a, b.email)
    expect(await Connection.countDocuments({ requesterId: a.userId })).toBe(1)
    expect(mail(b.email)).toHaveLength(1)

    expect((await a.agent.post(`/api/partners/${incoming[0].id}/respond`).send({ action: 'accept' })).status).toBe(400) // only the invited person
    expect((await b.agent.post(`/api/partners/${incoming[0].id}/respond`).send({ action: 'accept' })).status).toBe(200)
    const [pa] = (await list(a)).partners
    const [pb] = (await list(b)).partners
    expect(pa.youShare).toEqual({ streak: true, weekProgress: true, threads: false, taskTitles: false })
    expect(pb.theyShare).toEqual(pa.youShare)
    expect((await list(a)).outgoing).toEqual([])
  })

  it('the answer does not reveal whether the email has an account; a newcomer finds the request after signing up', async () => {
    const a = await person('carol')
    const existing = await person('dave')
    const known = await invite(a, existing.email)
    const stranger = `newcomer${++n}@example.com`
    const unknown = await invite(a, stranger)
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(mail(stranger)[0].text).toMatch(/invite code/)
    // they sign up (and confirm) with that address
    const newbie = await signedUpAgent(ctx, stranger)
    const incoming = (await list(newbie)).incoming
    expect(incoming).toHaveLength(1)
    expect((await newbie.agent.post(`/api/partners/${incoming[0].id}/respond`).send({ action: 'accept' })).status).toBe(200)
    expect((await list(a)).partners.map((p: any) => p.name)).toContain(stranger)
  })

  it('an unconfirmed address cannot claim an invitation sent to it', async () => {
    const a = await person('erin')
    const email = `squatter${++n}@example.com`
    await invite(a, email)
    const squatter = await signedUpAgent(ctx, email, { verify: false })
    expect((await squatter.agent.get('/api/partners')).status).toBe(403)
    await User.updateOne({ _id: squatter.userId }, { $set: { emailVerifiedAt: null } })
  })

  it('shows a partner only what they chose to share, and they can change it at any time', async () => {
    const { a, b, id } = await pair()
    const t = await Thread.create({ userId: b.userId, name: 'Secret Novel', frequency: 'daily', taskMode: 'continuous' })
    await Task.create({ userId: b.userId, title: 'Write chapter 3', threadId: t._id, date: today(), status: 'done', completedAt: new Date() })
    await Task.create({ userId: b.userId, title: 'Edit chapter 2', threadId: t._id, date: today(), status: 'pending' })

    const view = async () => (await a.agent.get(`/api/partners/${id}/progress`)).body
    let p = await view()
    expect(p.streak).toBe(1)
    expect(p.week).toMatchObject({ completed: 1, total: 2 })
    expect(p.threads).toBeUndefined()
    expect(p.today).toBeUndefined()
    expect(JSON.stringify(p)).not.toMatch(/Secret Novel|chapter/)

    await b.agent.put(`/api/partners/${id}/sharing`).send({ threads: true, taskTitles: true })
    p = await view()
    expect(p.threads).toEqual([{ name: 'Secret Novel', done: 1, total: 2 }])
    expect(p.today).toEqual(expect.arrayContaining([{ title: 'Write chapter 3', done: true }, { title: 'Edit chapter 2', done: false }]))

    await b.agent.put(`/api/partners/${id}/sharing`).send({ threads: false, taskTitles: false, weekProgress: false, streak: false })
    p = await view()
    expect(Object.keys(p).sort()).toEqual(['name', 'shares'])

    // A changing their own sharing never changes what B has chosen
    await a.agent.put(`/api/partners/${id}/sharing`).send({ taskTitles: true })
    expect((await list(b)).partners[0].youShare.taskTitles).toBe(false)
    expect((await list(b)).partners[0].theyShare.taskTitles).toBe(true)
    expect((await b.agent.put(`/api/partners/${id}/sharing`).send({ streak: 'yes' })).status).toBe(400)
  })

  it('strangers cannot see, change or message a partnership', async () => {
    const { id } = await pair()
    const d = await person('stranger')
    expect((await d.agent.get(`/api/partners/${id}/progress`)).status).toBe(404)
    expect((await d.agent.put(`/api/partners/${id}/sharing`).send({ streak: false })).status).toBe(404)
    expect((await d.agent.post(`/api/partners/${id}/cheer`)).status).toBe(404)
    expect((await d.agent.post(`/api/partners/${id}/respond`).send({ action: 'accept' })).status).toBe(404)
    expect((await d.agent.delete(`/api/partners/${id}`)).status).toBe(404)
    expect((await d.agent.get('/api/partners/nope/progress')).status).toBe(404)
    expect(await Connection.countDocuments({ _id: id })).toBe(1)
  })

  it('declining and blocking keep the inviter out; a declined invite can be renewed after a week', async () => {
    const a = await person('frank'), b = await person('gina')
    await invite(a, b.email)
    const id = (await list(b)).incoming[0].id
    await b.agent.post(`/api/partners/${id}/respond`).send({ action: 'decline' })
    expect((await list(b)).incoming).toEqual([])
    expect((await list(a)).outgoing).toEqual([]) // the decline is not announced
    await invite(a, b.email)
    expect((await list(b)).incoming).toEqual([]) // too soon
    await Connection.updateOne({ _id: id }, { $set: { updatedAt: new Date(Date.now() - 8 * 86400_000) } }, { timestamps: false })
    await invite(a, b.email)
    expect((await list(b)).incoming).toHaveLength(1)
    await b.agent.post(`/api/partners/${id}/respond`).send({ action: 'block' })
    await Connection.updateOne({ _id: id }, { $set: { updatedAt: new Date(Date.now() - 30 * 86400_000) } }, { timestamps: false })
    await invite(a, b.email)
    expect((await list(b)).incoming).toEqual([]) // blocked for good
  })

  it('an invitation going the other way is accepted automatically; self-invites are refused', async () => {
    const a = await person('hugo'), b = await person('iris')
    await invite(a, b.email)
    await invite(b, a.email)
    expect((await list(a)).partners).toHaveLength(1)
    expect((await list(b)).partners).toHaveLength(1)
    expect(await Connection.countDocuments({ $or: [{ requesterId: a.userId }, { requesterId: b.userId }] })).toBe(1)
    expect((await invite(a, a.email)).status).toBe(400)
    expect((await a.agent.post('/api/partners/invite').send({ email: 'not-an-email' })).status).toBe(400)
  })

  it('either side can end a partnership; the inviter can withdraw; account deletion removes them', async () => {
    const { a, b, id } = await pair()
    expect((await b.agent.delete(`/api/partners/${id}`)).status).toBe(200)
    expect((await list(a)).partners).toEqual([])
    expect((await a.agent.get(`/api/partners/${id}/progress`)).status).toBe(404)

    const c = await person('jack')
    await invite(a, c.email)
    const pending = (await list(a)).outgoing[0].id
    expect((await a.agent.delete(`/api/partners/${pending}`)).status).toBe(200)
    expect((await list(c)).incoming).toEqual([])

    const d = await person('kate')
    await invite(a, d.email)
    await invite(d, `someone${++n}@example.com`)
    await d.agent.post('/api/account/delete').send({ confirmEmail: d.email, password: 'correct horse battery' })
    expect(await Connection.countDocuments({ $or: [{ requesterId: d.userId }, { addresseeId: d.userId }, { inviteeEmail: d.email }] })).toBe(0)
  })

  it('enforces the plan’s partner limit and a daily limit on invitations', async () => {
    const a = await person('liam')
    for (let i = 0; i < 3; i++) expect((await invite(a, `free${n}x${i}@example.com`)).status).toBe(200)
    const over = await invite(a, `free${n}x9@example.com`)
    expect(over.status).toBe(403)
    expect(over.body.error).toMatch(/allows 3 partners/)

    const pro = await person('mona')
    await User.updateOne({ _id: pro.userId }, { $set: { plan: 'pro', planExpiresAt: new Date(Date.now() + 1e9) } })
    for (let i = 0; i < 10; i++) expect((await invite(pro, `pro${n}x${i}@example.com`)).status).toBe(200)
    const daily = await invite(pro, `pro${n}x99@example.com`)
    expect(daily.status).toBe(429)
  })

  it('cheering sends a push to the partner, a few times a day at most', async () => {
    const { a, b, id } = await pair()
    process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
    await PushSubscription.create({ userId: b.userId, endpoint: 'https://push.example/bob', keys: { p256dh: 'k', auth: 'a' } })
    const sent: { endpoint: string; body: string }[] = []
    setPushSender(async (sub, body) => { sent.push({ endpoint: sub.endpoint, body }) })
    for (let i = 0; i < 3; i++) expect((await a.agent.post(`/api/partners/${id}/cheer`)).status).toBe(200)
    expect((await a.agent.post(`/api/partners/${id}/cheer`)).status).toBe(429)
    expect(sent).toHaveLength(3)
    expect(sent[0].endpoint).toBe('https://push.example/bob')
    expect(JSON.parse(sent[0].body).title).toMatch(/cheering you on/)
    // pending partners cannot be cheered
    const c = await person('nina')
    await invite(a, c.email)
    const pendingId = (await list(a)).outgoing[0].id
    expect((await a.agent.post(`/api/partners/${pendingId}/cheer`)).status).toBe(400)
  })
})
