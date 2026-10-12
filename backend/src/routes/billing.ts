import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { BillingError, billingStatus, confirmFor, fulfil, startCheckout, validWebhookSignature } from '../services/billingService'
import { getDropUsage } from '../services/dropService'
import { getUsage } from '../services/aiService'
import { getPlan } from '../services/planService'
import { Thread } from '../models/Thread'
import { ThreadMember } from '../models/ThreadMember'
import { Connection } from '../models/Connection'
import { PLANS } from '../../../src/shared/plans'

export const billingRouter = Router()

const fail = (res: any, error: unknown) => {
  if (error instanceof BillingError) return res.status(error.status).json({ error: error.message })
  console.error('Billing error:', error instanceof Error ? error.message : error)
  return res.status(502).json({ error: 'The payment provider didn’t answer. Please try again.' })
}

/** Plan, price, what the person uses and what the plan allows. */
billingRouter.get('/status', async (req, res) => {
  try {
    const userId = uid(req)
    const [status, { limits }, drop, ai, threads, partners, shared] = await Promise.all([
      billingStatus(userId), getPlan(userId), getDropUsage(userId), getUsage(userId),
      Thread.countDocuments({ userId, status: { $ne: 'archived' } }),
      Connection.countDocuments({ $or: [{ requesterId: userId }, { addresseeId: userId }], status: { $in: ['pending', 'accepted'] } }),
      ThreadMember.countDocuments({ ownerId: userId }),
    ])
    res.json({
      ...status, limits, plans: PLANS,
      usage: { dropBytes: drop.usedBytes, dropItems: drop.items, threads, aiTokens: ai.used, partners, sharedMembers: shared },
    })
  } catch (error) {
    fail(res, error)
  }
})

const checkoutSchema = z.object({ interval: z.enum(['month', 'year']) })
billingRouter.post('/checkout', validateRequest(checkoutSchema), async (req, res) => {
  try {
    res.json(await startCheckout(uid(req), req.body.interval))
  } catch (error) {
    fail(res, error)
  }
})

const confirmSchema = z.object({ reference: z.string().min(8).max(120) })
/** The page the provider sends the person back to calls this, in case the webhook is slow. */
billingRouter.post('/confirm', validateRequest(confirmSchema), async (req, res) => {
  try {
    res.json(await confirmFor(uid(req), req.body.reference))
  } catch (error) {
    fail(res, error)
  }
})

/** Called by the provider, not by a person: the signature is the only credential. Always answers 200 for events it understands, so it isn't retried forever. */
export const billingWebhook: import('express').RequestHandler = async (req, res) => {
  if (!validWebhookSignature((req as any).rawBody, req.headers['x-paystack-signature'] as string | undefined)) return res.status(401).json({ error: 'Bad signature' })
  try {
    if (req.body?.event === 'charge.success' && typeof req.body?.data?.reference === 'string') {
      await fulfil(req.body.data.reference).catch(error => {
        if (!(error instanceof BillingError)) throw error
        console.error('Webhook payment not applied:', error.message)
      })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error('Billing webhook failed:', error instanceof Error ? error.message : error)
    res.status(500).json({ error: 'try again' }) // the provider retries
  }
}
