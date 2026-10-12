import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import crypto from 'crypto'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { setBillingProvider, sendPlanReminders, resetReminderClock, type VerifiedPayment } from '../services/billingService'
import { Payment } from '../models/Payment'
import { User } from '../models/User'
import { Thread } from '../models/Thread'

const available = await dbReachable()
const SECRET = 'sk_test_secret'
const DAY = 86_400_000

describe.skipIf(!available)('paid plans', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let n = 0
  const person = () => signedUpAgent(ctx, `payer${++n}@example.com`)
  const orders = new Map<string, Partial<VerifiedPayment> & { status: VerifiedPayment['status'] }>()
  const initialised: any[] = []

  beforeAll(async () => {
    ctx = await startTestApp()
    setBillingProvider({
      initialize: async input => { initialised.push(input); return { url: `https://pay.test/${input.reference}` } },
      verify: async ref => {
        const o = orders.get(ref)
        if (!o) throw new Error('unknown at provider')
        const p = await Payment.findOne({ reference: ref })
        return { status: o.status, amountMinor: o.amountMinor ?? p!.amountMinor, currency: o.currency ?? p!.currency, email: 'x@example.com', metadata: { userId: o.metadata?.userId ?? String(p!.userId), months: p!.months } }
      },
    })
  })
  afterAll(async () => { setBillingProvider(null); await ctx.stop() })
  afterEach(() => { for (const k of ['PRO_PRICE_MONTHLY_MINOR', 'PRO_PRICE_YEARLY_MINOR', 'BILLING_CURRENCY', 'PAYSTACK_SECRET_KEY']) delete process.env[k] })

  const priced = () => { process.env.PRO_PRICE_MONTHLY_MINOR = '500000'; process.env.BILLING_CURRENCY = 'NGN' }
  const checkout = (a: any, interval: string) => a.agent.post('/api/billing/checkout').send({ interval })
  const planOf = async (id: string) => (await User.findOne({ _id: id }))!

  it('reports the plan, prices, limits and usage; payments are off until prices are set', async () => {
    const a = await person()
    await Thread.create({ userId: a.userId, name: 'T', frequency: 'daily', taskMode: 'continuous' })
    let s = (await a.agent.get('/api/billing/status')).body
    expect(s).toMatchObject({ enabled: false, plan: 'free', expiresAt: null })
    expect(s.limits.maxThreads).toBe(30)
    expect(s.usage).toMatchObject({ threads: 1, dropBytes: 0, aiTokens: 0 })
    expect(s.plans.pro.limits.maxThreads).toBeGreaterThan(30)
    expect((await checkout(a, 'month')).status).toBe(503)
    priced()
    s = (await a.agent.get('/api/billing/status')).body
    expect(s.enabled).toBe(true)
    expect(s.prices.month.label).toMatch(/5,000\.00/)
    expect(s.prices.year.amountMinor).toBe(5_000_000) // ten months for a year
    expect((await request(ctx.app).get('/api/billing/status')).status).toBe(401)
  })

  it('checkout creates a pending order and hands back the provider’s page', async () => {
    priced()
    const a = await person()
    expect((await checkout(a, 'decade')).status).toBe(400)
    const res = await checkout(a, 'year')
    expect(res.status).toBe(200)
    expect(res.body.url).toBe(`https://pay.test/${res.body.reference}`)
    const order = await Payment.findOne({ reference: res.body.reference })
    expect(order).toMatchObject({ months: 12, amountMinor: 5_000_000, currency: 'NGN', status: 'pending' })
    expect(String(order!.userId)).toBe(a.userId)
    const sent = initialised[initialised.length - 1]
    expect(sent).toMatchObject({ email: a.email, amountMinor: 5_000_000, metadata: { userId: a.userId, months: 12 } })
    expect(sent.callbackUrl).toMatch(/\/billing$/)
    expect((await planOf(a.userId)).plan).toBe('free') // not Pro until paid
  })

  it('a paid order makes the person Pro for the period, once, and later payments add on', async () => {
    priced()
    const a = await person()
    const ref = (await checkout(a, 'month')).body.reference
    orders.set(ref, { status: 'pending' })
    expect((await a.agent.post('/api/billing/confirm').send({ reference: ref })).body).toMatchObject({ applied: false, status: 'pending' })
    expect((await planOf(a.userId)).plan).toBe('free')

    orders.set(ref, { status: 'success' })
    const [one, two] = await Promise.all([a.agent.post('/api/billing/confirm').send({ reference: ref }), a.agent.post('/api/billing/confirm').send({ reference: ref })])
    expect([one.body.applied, two.body.applied].sort()).toEqual([false, true]) // exactly one applied it
    const first = await planOf(a.userId)
    expect(first.plan).toBe('pro')
    const days = (first.planExpiresAt!.getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(27)
    expect(days).toBeLessThan(32)
    expect((await a.agent.post('/api/billing/confirm').send({ reference: ref })).body.applied).toBe(false)
    expect((await planOf(a.userId)).planExpiresAt!.getTime()).toBe(first.planExpiresAt!.getTime())
    expect(ctx.outbox.some(m => m.to === a.email && /Thanks for upgrading/.test(m.subject))).toBe(true)
    expect((await a.agent.get('/api/billing/status')).body).toMatchObject({ plan: 'pro' })

    // paying again while Pro adds to the end date
    const ref2 = (await checkout(a, 'month')).body.reference
    orders.set(ref2, { status: 'success' })
    await a.agent.post('/api/billing/confirm').send({ reference: ref2 })
    const second = (await planOf(a.userId)).planExpiresAt!.getTime()
    expect((second - first.planExpiresAt!.getTime()) / DAY).toBeGreaterThan(27)
  })

  it('refuses payments that do not match the order, and other people’s references', async () => {
    priced()
    const a = await person(), b = await person()
    const short = (await checkout(a, 'month')).body.reference
    orders.set(short, { status: 'success', amountMinor: 100 })
    expect((await a.agent.post('/api/billing/confirm').send({ reference: short })).status).toBe(400)
    const wrongCurrency = (await checkout(a, 'month')).body.reference
    orders.set(wrongCurrency, { status: 'success', currency: 'USD' })
    expect((await a.agent.post('/api/billing/confirm').send({ reference: wrongCurrency })).status).toBe(400)
    const someoneElses = (await checkout(a, 'month')).body.reference
    orders.set(someoneElses, { status: 'success', metadata: { userId: b.userId } })
    expect((await a.agent.post('/api/billing/confirm').send({ reference: someoneElses })).status).toBe(400)
    expect((await planOf(a.userId)).plan).toBe('free')
    expect((await Payment.findOne({ reference: short }))!.status).toBe('failed')

    const real = (await checkout(a, 'month')).body.reference
    orders.set(real, { status: 'success' })
    expect((await b.agent.post('/api/billing/confirm').send({ reference: real })).status).toBe(404)
    expect((await b.agent.post('/api/billing/confirm').send({ reference: 'wa_nonexistent_reference' })).status).toBe(404)
    expect((await planOf(b.userId)).plan).toBe('free')
    const failedAtProvider = (await checkout(b, 'month')).body.reference
    orders.set(failedAtProvider, { status: 'failed' })
    expect((await b.agent.post('/api/billing/confirm').send({ reference: failedAtProvider })).body.status).toBe('failed')
  })

  describe('webhook', () => {
    const post = (body: object, key = SECRET) => {
      const raw = JSON.stringify(body)
      const sig = crypto.createHmac('sha512', key).update(raw).digest('hex')
      return request(ctx.app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw)
    }

    it('only accepts a correctly signed call, then applies the payment once', async () => {
      priced()
      process.env.PAYSTACK_SECRET_KEY = SECRET
      const a = await person()
      const ref = (await checkout(a, 'month')).body.reference
      orders.set(ref, { status: 'success' })
      const body = { event: 'charge.success', data: { reference: ref } }
      expect((await request(ctx.app).post('/api/billing/webhook').send(body)).status).toBe(401) // no signature
      expect((await post(body, 'sk_wrong')).status).toBe(401)
      expect((await planOf(a.userId)).plan).toBe('free')
      expect((await post(body)).status).toBe(200)
      const until = (await planOf(a.userId)).planExpiresAt!.getTime()
      expect((await planOf(a.userId)).plan).toBe('pro')
      expect((await post(body)).status).toBe(200) // provider retries are harmless
      expect((await planOf(a.userId)).planExpiresAt!.getTime()).toBe(until)
    })

    it('ignores other events and unknown references without failing', async () => {
      process.env.PAYSTACK_SECRET_KEY = SECRET
      expect((await post({ event: 'transfer.success', data: {} })).status).toBe(200)
      expect((await post({ event: 'charge.success', data: { reference: 'wa_unknown_ref_123' } })).status).toBe(200)
    })
  })

  it('admins can give or end Pro, and see each person’s plan', async () => {
    const admin = await person()
    await User.updateOne({ _id: admin.userId }, { $set: { role: 'admin' } })
    const a = await person()
    expect((await a.agent.post(`/api/admin/users/${a.userId}/plan`).send({ plan: 'pro', days: 30 })).status).toBe(403)
    expect((await admin.agent.post(`/api/admin/users/${a.userId}/plan`).send({ plan: 'pro' })).status).toBe(400)
    expect((await admin.agent.post(`/api/admin/users/${a.userId}/plan`).send({ plan: 'pro', days: 30 })).status).toBe(200)
    const row = (await admin.agent.get(`/api/admin/users?q=${encodeURIComponent(a.email)}`)).body.users[0]
    expect(row.plan).toBe('pro')
    expect(new Date(row.planExpiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY)
    expect((await admin.agent.post(`/api/admin/users/${a.userId}/plan`).send({ plan: 'free' })).status).toBe(200)
    expect((await planOf(a.userId)).plan).toBe('free')
    expect((await admin.agent.post('/api/admin/users/ffffffffffffffffffffffff/plan').send({ plan: 'free' })).status).toBe(404)
  })

  it('reminds people once, a few days before their Pro plan ends, and again after they renew', async () => {
    const a = await person()
    const ends = new Date(Date.now() + 2 * DAY)
    await User.updateOne({ _id: a.userId }, { $set: { plan: 'pro', planExpiresAt: ends } })
    const reminders = () => ctx.outbox.filter(m => m.to === a.email && /Pro plan ends soon/.test(m.subject))
    resetReminderClock()
    await sendPlanReminders()
    expect(reminders()).toHaveLength(1)
    await sendPlanReminders()
    expect(reminders()).toHaveLength(1)
    await User.updateOne({ _id: a.userId }, { $set: { planExpiresAt: new Date(Date.now() + 40 * DAY) } })
    await sendPlanReminders()
    expect(reminders()).toHaveLength(1) // not due yet
    await User.updateOne({ _id: a.userId }, { $set: { planExpiresAt: new Date(Date.now() + 1 * DAY) } })
    await sendPlanReminders()
    expect(reminders()).toHaveLength(2) // a new end date gets its own reminder
    const quiet = await person()
    await User.updateOne({ _id: quiet.userId }, { $set: { plan: 'pro', planExpiresAt: new Date(Date.now() + 30 * DAY) } })
    await sendPlanReminders()
    expect(ctx.outbox.filter(m => m.to === quiet.email && /ends soon/.test(m.subject))).toHaveLength(0)
  })
})
