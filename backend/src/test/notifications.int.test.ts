import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Settings } from '../models/Settings'
import { Task } from '../models/Task'
import { User } from '../models/User'
import { PushSubscription } from '../models/PushSubscription'
import { runNotificationTick, runUserTick, setPushSender } from '../services/notificationService'
import { unsubscribeUrl, emailRetryDelayMs, sendEmail, setEmailTransport } from '../services/emailService'

const available = await dbReachable()
// 2026-10-12 06:00 UTC; the test users are in UTC
const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00.000Z`)

describe.skipIf(!available)('notification scheduler and email digest', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let digestUser: { agent: any; userId: string; email: string }
  let quietUser: { agent: any; userId: string; email: string }
  const pushed: string[] = []

  beforeAll(async () => {
    ctx = await startTestApp()
    process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
    setPushSender(async sub => { pushed.push(sub.endpoint) })
    digestUser = await signedUpAgent(ctx, 'digest@example.com')
    quietUser = await signedUpAgent(ctx, 'quiet@example.com')
    // digest on at 07:30, no push for either
    await digestUser.agent.put('/api/settings').send({ notifications: { dailyPlan: { enabled: false, time: '07:30' }, dueTasks: { enabled: true }, eventReminders: { enabled: true, minutesBefore: 15 }, emailDigest: { enabled: true, time: '07:30' } } })
    await Task.create({ userId: digestUser.userId, title: 'Write report', date: new Date('2026-10-12T00:00:00.000Z'), timeBlock: 'morning', status: 'pending' })
    await Task.create({ userId: quietUser.userId, title: 'Quiet task', date: new Date('2026-10-12T00:00:00.000Z'), timeBlock: 'morning', status: 'pending' })
  })
  afterAll(async () => { setPushSender(null); await ctx.stop() })
  beforeEach(() => { ctx.outbox.length = 0 })

  const digests = () => ctx.outbox.filter(m => m.to === 'digest@example.com' && /Your day/.test(m.subject))

  it('only looks at users whose check has come; users with nothing to deliver are parked', async () => {
    await Settings.updateMany({}, { $set: { nextCheckAt: new Date(0) } }).setOptions({ crossUser: true })
    const first = await runNotificationTick(at('06:00'))
    expect(first.users).toBeGreaterThanOrEqual(2)
    const quiet = await Settings.findOne({ userId: quietUser.userId })
    expect(quiet!.nextCheckAt.getTime()).toBeGreaterThan(at('06:00').getTime() + 20 * 3600_000) // parked ~24h
    // a second tick right away has nobody due
    expect((await runNotificationTick(at('06:00'))).users).toBe(0)
  })

  it('sends the digest at its time, once, with an unsubscribe link', async () => {
    expect(digests()).toHaveLength(0) // 06:00: too early
    const early = await Settings.findOne({ userId: digestUser.userId })
    // woken for 07:30 (90 minutes), not parked for a day
    expect(early!.nextCheckAt.getTime()).toBe(at('07:30').getTime())

    expect((await runNotificationTick(at('07:29'))).users).toBe(0)
    const sent = await runNotificationTick(at('07:30'))
    expect(sent.sent).toBe(1)
    expect(digests()).toHaveLength(1)
    const mail = digests()[0]
    expect(mail.subject).toBe('Your day: 1 task')
    expect(mail.text).toContain('Write report')
    expect(mail.text).toContain(unsubscribeUrl(digestUser.userId))
    expect(mail.headers?.['List-Unsubscribe']).toContain('/api/email/unsubscribe')

    await Settings.updateOne({ userId: digestUser.userId }, { $set: { nextCheckAt: new Date(0) } })
    await runNotificationTick(at('07:45'))
    expect(digests()).toHaveLength(1) // not twice
  })

  it('the unsubscribe link switches the digest off; a forged link does nothing', async () => {
    const bad = await request(ctx.app).get(`/api/email/unsubscribe?u=${digestUser.userId}&s=${'0'.repeat(64)}`)
    expect(bad.status).toBe(400)
    expect((await Settings.findOne({ userId: digestUser.userId }))!.notifications!.emailDigest!.enabled).toBe(true)
    const url = new URL(unsubscribeUrl(digestUser.userId))
    const ok = await request(ctx.app).get(url.pathname + url.search)
    expect(ok.status).toBe(200)
    expect((await Settings.findOne({ userId: digestUser.userId }))!.notifications!.emailDigest!.enabled).toBe(false)
  })

  it('no digest for an unconfirmed email address, and nothing for suspended users', async () => {
    const un = await signedUpAgent(ctx, 'unverified@example.com', { verify: false })
    await un.agent.put('/api/settings').send({ notifications: { dailyPlan: { enabled: false, time: '07:30' }, dueTasks: { enabled: true }, eventReminders: { enabled: true, minutesBefore: 15 }, emailDigest: { enabled: true, time: '07:30' } } })
    await runUserTick(un.userId, at('07:30'))
    expect(ctx.outbox.filter(m => m.to === 'unverified@example.com' && /Your day/.test(m.subject))).toHaveLength(0)

    await digestUser.agent.put('/api/settings').send({ notifications: { dailyPlan: { enabled: false, time: '07:30' }, dueTasks: { enabled: true }, eventReminders: { enabled: true, minutesBefore: 15 }, emailDigest: { enabled: true, time: '07:30' } } })
    await User.updateOne({ _id: digestUser.userId }, { $set: { status: 'suspended' } })
    await runUserTick(digestUser.userId, at('07:31'))
    expect(digests()).toHaveLength(0)
    await User.updateOne({ _id: digestUser.userId }, { $set: { status: 'active' } })
  })

  it('a failing email send is retried on the next pass instead of being lost', async () => {
    const mine = await signedUpAgent(ctx, 'retry@example.com')
    await mine.agent.put('/api/settings').send({ notifications: { dailyPlan: { enabled: false, time: '07:30' }, dueTasks: { enabled: true }, eventReminders: { enabled: true, minutesBefore: 15 }, emailDigest: { enabled: true, time: '07:30' } } })
    emailRetryDelayMs.value = 1
    let calls = 0
    setEmailTransport(async () => { calls++; throw new Error('provider down') })
    await runUserTick(mine.userId, at('07:30'))
    expect(calls).toBe(2) // first try + one retry
    const got: string[] = []
    setEmailTransport(async e => { got.push(e.to) })
    await runUserTick(mine.userId, at('07:35'))
    expect(got).toEqual(['retry@example.com'])
    setEmailTransport(async e => { ctx.outbox.push(e) })
  })

  it('a bad address is not retried', async () => {
    emailRetryDelayMs.value = 1
    let calls = 0
    setEmailTransport(async () => { calls++; throw Object.assign(new Error('rejected'), { status: 422 }) })
    await expect(sendEmail({ to: 'x@example.com', subject: 's', text: 't' })).rejects.toThrow('rejected')
    expect(calls).toBe(1)
    setEmailTransport(async e => { ctx.outbox.push(e) })
  })

  it('push users get event reminders at the right minute; editing an event wakes them up', async () => {
    const mine = await signedUpAgent(ctx, 'pusher@example.com')
    await PushSubscription.create({ userId: mine.userId, endpoint: 'https://push.example/pusher', keys: { p256dh: 'k', auth: 'a' } })
    pushed.length = 0
    await Settings.updateOne({ userId: mine.userId }, { $set: { nextCheckAt: new Date(0), 'notifications.dailyPlan.enabled': false } })
    await runNotificationTick(at('06:00'))
    // an event at 09:00 is added after the user was parked until the cap
    const made = await mine.agent.post('/api/tasks').send({ title: 'Standup', date: '2026-10-12', isEvent: true, startTime: '09:00', endTime: '09:30', timeBlock: 'morning' })
    expect(made.status).toBe(201)
    expect((await Settings.findOne({ userId: mine.userId }))!.nextCheckAt.getTime()).toBe(0) // flagged
    await runNotificationTick(at('08:44'))
    expect(pushed).toHaveLength(0)
    await Settings.updateOne({ userId: mine.userId }, { $set: { nextCheckAt: new Date(0) } })
    await runNotificationTick(at('08:45'))
    expect(pushed).toEqual(['https://push.example/pusher'])
  })
})
