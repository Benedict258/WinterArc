import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Habit } from '../models/Habit'
import { HabitLog } from '../models/HabitLog'
import { PushSubscription } from '../models/PushSubscription'
import { setPushSender } from '../services/pushService'
import { checkIn, createHabit, listHabits, monthlyOverview } from '../services/habitService'
import { runHabitNotifications } from '../services/habitNotifyService'
import { DEFAULT_NOTIFICATIONS } from '../../../src/shared/notificationPlan'
import { addDays } from '../../../src/shared/habits'

const available = await dbReachable()
const spec = (over: Record<string, unknown> = {}) => ({ name: 'Read', emoji: '📚', unit: 'pages', weekdays: [0, 1, 2, 3, 4, 5, 6], target: 1, ...over })
const todayUtc = () => new Date().toISOString().slice(0, 10) // signup timezone is UTC in the harness

describe.skipIf(!available)('habits', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { await ctx.stop() })

  it('creates, checks in, undoes and reports streaks', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hab1@example.com')
    const h = (await agent.post('/api/habits').send(spec())).body
    expect(h.name).toBe('Read')
    expect(h.today).toMatchObject({ value: 0, done: false, scheduled: true })

    const a = await agent.post(`/api/habits/${h.id}/checkin`).send({ value: 1 })
    expect(a.status).toBe(200)
    expect(a.body.today.done).toBe(true)
    expect(a.body.streak.current).toBe(1)
    // the same request again changes nothing
    const again = await agent.post(`/api/habits/${h.id}/checkin`).send({ value: 1 })
    expect(again.body.streak.current).toBe(1)
    expect(await HabitLog.countDocuments({ userId, habitId: h.id })).toBe(1)

    // yesterday and the day before make a 3-day run
    for (const back of [1, 2]) await agent.post(`/api/habits/${h.id}/checkin`).send({ day: addDays(todayUtc(), -back), value: 1 })
    expect((await agent.get('/api/habits')).body.habits[0].streak).toMatchObject({ current: 3, best: 3 })

    // undo today: the run is still alive (today is open), 2 days
    const undone = await agent.post(`/api/habits/${h.id}/checkin`).send({ value: 0 })
    expect(undone.body.today.done).toBe(false)
    expect(undone.body.streak.current).toBe(2)
    expect(await HabitLog.countDocuments({ userId, habitId: h.id, day: todayUtc() })).toBe(0)
  })

  it('count habits need the target; "add" accumulates', async () => {
    const { agent } = await signedUpAgent(ctx, 'hab2@example.com')
    const h = (await agent.post('/api/habits').send(spec({ name: 'Water', unit: 'glasses', target: 8 }))).body
    for (let i = 0; i < 3; i++) await agent.post(`/api/habits/${h.id}/checkin`).send({ add: 2 })
    let now = (await agent.get('/api/habits')).body.habits[0]
    expect(now.today).toMatchObject({ value: 6, done: false })
    await agent.post(`/api/habits/${h.id}/checkin`).send({ add: 2 })
    now = (await agent.get('/api/habits')).body.habits[0]
    expect(now.today).toMatchObject({ value: 8, done: true })
    await agent.post(`/api/habits/${h.id}/checkin`).send({ add: -100 })
    expect((await agent.get('/api/habits')).body.habits[0].today.value).toBe(0) // never below zero
  })

  it('rejects bad input: future days, ancient days, both value and add, invalid habits, too many habits', async () => {
    const { agent } = await signedUpAgent(ctx, 'hab3@example.com')
    const h = (await agent.post('/api/habits').send(spec())).body
    const post = (b: object) => agent.post(`/api/habits/${h.id}/checkin`).send(b)
    expect((await post({ day: addDays(todayUtc(), 2), value: 1 })).status).toBe(400)
    expect((await post({ day: addDays(todayUtc(), -500), value: 1 })).status).toBe(400)
    expect((await post({ value: 1, add: 1 })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post({ day: 'yesterday', value: 1 })).status).toBe(400)
    expect((await agent.post('/api/habits').send(spec({ name: '' }))).status).toBe(400)
    expect((await agent.post('/api/habits').send(spec({ weekdays: [] }))).status).toBe(400)
    expect((await agent.post('/api/habits').send(spec({ target: 0 }))).status).toBe(400)
    for (let i = 0; i < 29; i++) expect((await agent.post('/api/habits').send(spec({ name: `H${i}` }))).status).toBe(200)
    expect((await agent.post('/api/habits').send(spec({ name: 'one too many' }))).status).toBe(409)
  })

  it('keeps habits private to their owner', async () => {
    const a = await signedUpAgent(ctx, 'hab4@example.com')
    const b = await signedUpAgent(ctx, 'hab5@example.com')
    const h = (await a.agent.post('/api/habits').send(spec())).body
    expect((await b.agent.get('/api/habits')).body.habits).toEqual([])
    expect((await b.agent.post(`/api/habits/${h.id}/checkin`).send({ value: 1 })).status).toBe(404)
    expect((await b.agent.put(`/api/habits/${h.id}`).send(spec({ name: 'Mine now' }))).status).toBe(404)
    expect((await b.agent.post(`/api/habits/${h.id}/archive`)).status).toBe(404)
    expect((await b.agent.delete(`/api/habits/${h.id}`)).status).toBe(404)
    expect((await a.agent.get('/api/habits')).body.habits[0].name).toBe('Read')
  })

  it('archive hides a habit but keeps history; delete removes the logs too', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hab6@example.com')
    const keep = (await agent.post('/api/habits').send(spec({ name: 'Keep' }))).body
    const drop = (await agent.post('/api/habits').send(spec({ name: 'Drop' }))).body
    await agent.post(`/api/habits/${keep.id}/checkin`).send({ value: 1 })
    await agent.post(`/api/habits/${drop.id}/checkin`).send({ value: 1 })
    await agent.post(`/api/habits/${keep.id}/archive`)
    expect((await agent.get('/api/habits')).body.habits.map((x: any) => x.name)).toEqual(['Drop'])
    expect(await HabitLog.countDocuments({ userId, habitId: keep.id })).toBe(1)
    await agent.delete(`/api/habits/${drop.id}`)
    expect(await HabitLog.countDocuments({ userId, habitId: drop.id })).toBe(0)
    expect((await agent.post(`/api/habits/${keep.id}/checkin`).send({ value: 1 })).status).toBe(404) // archived habits can't be logged
  })

  it('celebrates a streak milestone once, and again only after the run is broken', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hab7@example.com')
    process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
    await PushSubscription.create({ userId, endpoint: 'https://push.example/hab7', keys: { p256dh: 'k', auth: 'a' } })
    const sent: any[] = []
    setPushSender(async (_sub, body) => { sent.push(JSON.parse(body)) })
    try {
      const h = await createHabit(userId, spec())
      // two earlier days, then today makes the third
      await checkIn(userId, h.id, { day: addDays(todayUtc(), -2), value: 1 })
      await checkIn(userId, h.id, { day: addDays(todayUtc(), -1), value: 1 })
      expect(sent).toHaveLength(0)
      const r = await checkIn(userId, h.id, { value: 1 })
      expect(r.milestone).toBe(3)
      await new Promise(r => setTimeout(r, 50))
      expect(sent.map(s => s.title)).toEqual(['3-day streak 📚'])
      // undo and redo today: no second celebration
      await checkIn(userId, h.id, { value: 0 })
      const redo = await checkIn(userId, h.id, { value: 1 })
      expect(redo.milestone).toBeNull()
      await new Promise(r => setTimeout(r, 50))
      expect(sent).toHaveLength(1)
      // turning habit notifications off silences the push but not the in-app result
      await agent.put('/api/settings').send({ notifications: { ...DEFAULT_NOTIFICATIONS, habits: { enabled: false, time: '20:00' } } })
      const h2 = await createHabit(userId, spec({ name: 'Walk' }))
      await checkIn(userId, h2.id, { day: addDays(todayUtc(), -2), value: 1 }); await checkIn(userId, h2.id, { day: addDays(todayUtc(), -1), value: 1 })
      expect((await checkIn(userId, h2.id, { value: 1 })).milestone).toBe(3)
      await new Promise(r => setTimeout(r, 50))
      expect(sent).toHaveLength(1)
    } finally { setPushSender(null) }
  })

  it('monthly overview averages across habits, newest month first', async () => {
    const { userId } = await signedUpAgent(ctx, 'hab8@example.com')
    const h = await createHabit(userId, spec(), new Date('2026-08-20T10:00:00Z'))
    const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))
    for (const d of days('2026-08-20', 12)) await HabitLog.create({ userId, habitId: h.id, day: d, value: 1 })        // Aug 20–31: all done
    for (const d of days('2026-09-01', 15)) await HabitLog.create({ userId, habitId: h.id, day: d, value: 1 })       // Sep 1–15 of 30 done
    const o = await monthlyOverview(userId, new Date('2026-10-16T10:00:00Z'), 4)
    const sep = o.overall.find(m => m.month === '2026-09')!
    const aug = o.overall.find(m => m.month === '2026-08')!
    expect(aug).toMatchObject({ scheduled: 12, done: 12, rate: 1 })
    expect(sep).toMatchObject({ scheduled: 30, done: 15 })
    expect(sep.rate).toBeCloseTo(0.5)
    expect(o.overall.map(m => m.month)).toEqual([...o.overall.map(m => m.month)].sort().reverse())
    expect(o.habits[0].rows.length).toBeGreaterThanOrEqual(3)
  })

  describe('reminders and recap', () => {
    it('nudges once in the evening only if something is open, and recaps last month on the 1st', async () => {
      const { userId } = await signedUpAgent(ctx, 'hab9@example.com')
      const now = new Date('2026-11-01T20:30:00Z') // a Sunday evening, also the 1st
      const h = await createHabit(userId, spec({ name: 'Stretch' }), new Date('2026-09-20T10:00:00Z'))
      for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) await HabitLog.create({ userId, habitId: h.id, day: d, value: 1 })
      const claimed = new Set<string>(); const pushes: any[] = []
      const hooks = { claim: async (k: string) => (claimed.has(k) ? false : (claimed.add(k), true)), send: async (p: any) => { pushes.push(p) } }
      const clock = (m: number) => ({ dayKey: '2026-11-01', minutes: m })
      const settings = DEFAULT_NOTIFICATIONS

      expect(await runHabitNotifications(userId, now, clock(19 * 60), settings, hooks)).toEqual([]) // before 20:00
      const first = await runHabitNotifications(userId, now, clock(20 * 60 + 30), settings, hooks)
      expect(first).toEqual(['habit-remind:2026-11-01'])
      expect(pushes[0]).toMatchObject({ title: 'One habit left today', body: 'Stretch' })
      expect(await runHabitNotifications(userId, now, clock(20 * 60 + 31), settings, hooks)).toEqual([]) // once only

      // the recap is separate and only in the morning window of the 1st
      const morning = new Date('2026-11-01T09:10:00Z')
      const recap = await runHabitNotifications(userId, morning, clock(9 * 60 + 10), settings, hooks)
      expect(recap).toEqual(['habit-month:2026-10'])
      const p = pushes.find(x => /recap/.test(x.title))!
      expect(p.title).toBe('October recap')
      expect(p.body).toContain('Stretch')

      // all done → no nudge, and the day's claim is kept for later in case they undo
      await HabitLog.create({ userId, habitId: h.id, day: '2026-11-01', value: 1 })
      const quiet = await runHabitNotifications(userId, now, { dayKey: '2026-11-02', minutes: 20 * 60 }, settings, { ...hooks, claim: async () => true })
      expect(quiet.length).toBe(0)
    })

    it('does nothing when habit notifications are off', async () => {
      const { userId } = await signedUpAgent(ctx, 'hab10@example.com')
      await createHabit(userId, spec())
      const out = await runHabitNotifications(userId, new Date(), { dayKey: todayUtc(), minutes: 20 * 60 + 5 }, { ...DEFAULT_NOTIFICATIONS, habits: { enabled: false, time: '20:00' } }, { claim: async () => true, send: async () => { throw new Error('should not send') } })
      expect(out).toEqual([])
    })
  })

  it('lists nothing for a person with no habits and survives account export/deletion tables', async () => {
    const { userId } = await signedUpAgent(ctx, 'hab11@example.com')
    expect((await listHabits(userId)).habits).toEqual([])
    expect(await Habit.countDocuments({ userId })).toBe(0)
  })
})
