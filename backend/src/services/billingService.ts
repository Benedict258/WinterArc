import crypto from 'crypto'
import { Payment, PaymentClaim } from '../models/Payment'
import { User } from '../models/User'
import { effectivePlan } from './planService'
import { sendEmail, appUrl, paymentReceiptMessage, planEndingMessage } from './emailService'

export class BillingError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// ------------------------------------------------------------ provider

export type VerifiedPayment = { status: 'success' | 'failed' | 'pending'; amountMinor: number; currency: string; email: string; metadata: { userId?: string; months?: number } }

export type BillingProvider = {
  initialize(input: { email: string; amountMinor: number; currency: string; reference: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<{ url: string }>
  verify(reference: string): Promise<VerifiedPayment>
}

const paystackKey = () => process.env.PAYSTACK_SECRET_KEY || ''

/** Paystack (paystack.com). Amounts are in the currency's smallest unit (kobo for NGN). */
const paystack: BillingProvider = {
  async initialize({ email, amountMinor, currency, reference, callbackUrl, metadata }) {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: amountMinor, currency, reference, callback_url: callbackUrl, metadata }),
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok || !data?.data?.authorization_url) throw new Error(`Paystack refused the checkout (${res.status})`)
    return { url: data.data.authorization_url }
  },
  async verify(reference) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackKey()}` } })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok || !data?.data) throw new Error(`Paystack couldn't verify the payment (${res.status})`)
    const d = data.data
    return {
      status: d.status === 'success' ? 'success' : d.status === 'failed' || d.status === 'abandoned' ? 'failed' : 'pending',
      amountMinor: Number(d.amount), currency: String(d.currency ?? ''), email: String(d.customer?.email ?? ''),
      metadata: { userId: d.metadata?.userId, months: Number(d.metadata?.months) || undefined },
    }
  },
}

let provider: BillingProvider = paystack
/** Tests replace the provider so no money (or network) is involved. */
export const setBillingProvider = (fake: BillingProvider | null) => { provider = fake ?? paystack }

export const billingConfigured = () => provider !== paystack || !!paystackKey()

/** Checks the `x-paystack-signature` header: HMAC-SHA512 of the raw body with the secret key. */
export function validWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!rawBody || !signature || !paystackKey()) return false
  const expected = crypto.createHmac('sha512', paystackKey()).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// -------------------------------------------------------------- prices

export type Interval = 'month' | 'year'
const MONTHS: Record<Interval, number> = { month: 1, year: 12 }

export function prices() {
  const currency = (process.env.BILLING_CURRENCY || 'NGN').toUpperCase()
  const month = Number(process.env.PRO_PRICE_MONTHLY_MINOR) || 0
  const year = Number(process.env.PRO_PRICE_YEARLY_MINOR) || month * 10 // two months free
  return { currency, month, year }
}
const amountFor = (interval: Interval) => prices()[interval]

const money = (minor: number, currency: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100) } catch { return `${(minor / 100).toFixed(2)} ${currency}` }
}

// ------------------------------------------------------------- status

export async function billingStatus(userId: string, now = new Date()) {
  const user = await User.findOne({ _id: userId }, { plan: 1, planExpiresAt: 1 })
  const plan = effectivePlan(user, now)
  const p = prices()
  return {
    enabled: billingConfigured() && p.month > 0,
    plan,
    expiresAt: plan === 'pro' ? user?.planExpiresAt ?? null : null,
    prices: {
      month: { amountMinor: p.month, label: money(p.month, p.currency) },
      year: { amountMinor: p.year, label: money(p.year, p.currency) },
      currency: p.currency,
    },
  }
}

// ----------------------------------------------------------- checkout

export async function startCheckout(userId: string, interval: Interval) {
  const status = await billingStatus(userId)
  if (!status.enabled) throw new BillingError(503, 'Payments aren’t set up on this server yet.')
  const user = await User.findOne({ _id: userId }, { email: 1 })
  if (!user) throw new BillingError(404, 'Account not found')
  const months = MONTHS[interval]
  const amountMinor = amountFor(interval)
  const reference = `wa_${userId}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  await Payment.create({ reference, userId, months, amountMinor, currency: prices().currency, status: 'pending' })
  const { url } = await provider.initialize({
    email: user.email, amountMinor, currency: prices().currency, reference,
    callbackUrl: `${appUrl()}/billing`, metadata: { userId, months },
  })
  return { url, reference }
}

// ---------------------------------------------------------- fulfilment

/**
 * Turn a paid reference into plan time. Always re-checks with the provider rather than trusting what the
 * caller (webhook or browser) says, matches the payment to what we created, and applies it exactly once.
 */
export async function fulfil(reference: string, now = new Date()): Promise<{ applied: boolean; status: 'success' | 'failed' | 'pending'; planUntil?: Date }> {
  const payment = await Payment.findOne({ reference })
  if (!payment) throw new BillingError(404, 'Unknown payment')
  if (payment.status === 'applied') return { applied: false, status: 'success', planUntil: payment.planUntil ?? undefined }

  const v = await provider.verify(reference)
  if (v.status !== 'success') {
    if (v.status === 'failed') await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed' } })
    return { applied: false, status: v.status }
  }
  if (v.currency !== payment.currency || v.amountMinor < payment.amountMinor || v.metadata.userId !== String(payment.userId)) {
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed' } })
    throw new BillingError(400, 'That payment doesn’t match the order.')
  }

  // Claim it: only one caller moves it from pending to applied
  // The claim is a document whose _id is the reference: a second insert is refused by the unique _id,
  // so even two requests at the same instant can't both apply the payment.
  try {
    await PaymentClaim.create({ _id: reference })
  } catch (error: any) {
    if (error?.code !== 11000) throw error
    const again = await Payment.findOne({ reference })
    return { applied: false, status: 'success', planUntil: again?.planUntil ?? undefined }
  }
  await Payment.updateOne({ _id: payment._id }, { $set: { status: 'applied', paidAt: now } })
  const claimed = (await Payment.findOne({ _id: payment._id }))!
  const user = await User.findOne({ _id: claimed.userId }, { plan: 1, planExpiresAt: 1, email: 1 })
  const base = user && effectivePlan(user, now) === 'pro' && user.planExpiresAt ? user.planExpiresAt : now
  const until = new Date(base.getTime())
  until.setUTCMonth(until.getUTCMonth() + claimed.months)
  await User.updateOne({ _id: claimed.userId }, { $set: { plan: 'pro', planExpiresAt: until } })
  await Payment.updateOne({ _id: claimed._id }, { $set: { planUntil: until } })
  if (user) await sendEmail(paymentReceiptMessage(user.email, claimed.months, until.toISOString().slice(0, 10), money(claimed.amountMinor, claimed.currency))).catch(() => {})
  return { applied: true, status: 'success', planUntil: until }
}

/** A person can only confirm their own references. */
export async function confirmFor(userId: string, reference: string) {
  const payment = await Payment.findOne({ reference })
  if (!payment || String(payment.userId) !== userId) throw new BillingError(404, 'Unknown payment')
  return fulfil(reference)
}

/** Admin: give someone Pro for a number of days, or end it. */
export async function grantPlan(userId: string, plan: 'free' | 'pro', days: number, now = new Date()) {
  if (plan === 'free') {
    await User.updateOne({ _id: userId }, { $set: { plan: 'free', planExpiresAt: null } })
    return
  }
  const user = await User.findOne({ _id: userId }, { plan: 1, planExpiresAt: 1 })
  const base = user && effectivePlan(user, now) === 'pro' && user.planExpiresAt ? user.planExpiresAt : now
  await User.updateOne({ _id: userId }, { $set: { plan: 'pro', planExpiresAt: new Date(base.getTime() + days * 86_400_000) } })
}

// ----------------------------------------------------------- reminders

/** Email people whose Pro plan ends within three days, once per plan end. */
export async function sendPlanReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 86_400_000)
  const due = await User.find({ plan: 'pro', status: 'active', planExpiresAt: { $gt: now, $lt: soon } }, { email: 1, planExpiresAt: 1, planReminderFor: 1 })
  let sent = 0
  for (const u of due) {
    if (u.planReminderFor && u.planReminderFor.getTime() === u.planExpiresAt!.getTime()) continue
    try {
      await sendEmail(planEndingMessage(u.email, u.planExpiresAt!.toISOString().slice(0, 10)))
      await User.updateOne({ _id: u._id }, { $set: { planReminderFor: u.planExpiresAt } })
      sent++
    } catch (error) {
      console.error('Plan reminder failed:', error instanceof Error ? error.message : error)
    }
  }
  return sent
}

let lastReminders = 0
export async function sendPlanRemindersIfDue(now = new Date()) {
  if (now.getTime() - lastReminders < 3600_000) return null
  lastReminders = now.getTime()
  return sendPlanReminders(now).catch(err => { console.error('Plan reminders failed:', err instanceof Error ? err.message : err); return null })
}
export const resetReminderClock = () => { lastReminders = 0 }
