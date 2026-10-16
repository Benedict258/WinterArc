import { Router } from 'express'
import { z } from 'zod'
import { validateRequest } from '../middleware/validationMiddleware'
import { uid } from '../middleware/auth'
import { AiError, aiConfigured, applyProposals, chat, dismissProposals, estimateMeal, getUsage, requestMore } from '../services/aiService'

// Mounted behind requireVerified (see server.ts): the assistant costs money, so it needs a confirmed email.
export const aiRouter = Router()

const hits = new Map<string, number[]>()
export const resetAiRateLimits = () => hits.clear()
/** At most `max` chat turns per user per hour, on top of the token allowance. */
function tooMany(userId: string, max = Number(process.env.AI_REQUESTS_PER_HOUR) || 30) {
  if (process.env.NODE_ENV === 'test') return false
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter(t => now - t < 3600_000)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > max
}

const fail = (res: any, error: unknown) => {
  if (error instanceof AiError) return res.status(error.status).json({ error: error.message, code: error.code })
  console.error('AI error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}

const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(20)
    .refine(m => m.length > 0 && m[0].role === 'user' && m[m.length - 1].role === 'user', 'The conversation must start and end with the person’s message'),
})
const idsSchema = z.object({ ids: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).min(1).max(30) })

aiRouter.get('/status', async (req, res) => {
  try {
    res.json({ enabled: aiConfigured(), usage: await getUsage(uid(req)) })
  } catch (error) {
    fail(res, error)
  }
})

aiRouter.post('/chat', validateRequest(chatSchema), async (req, res) => {
  try {
    if (tooMany(uid(req))) return res.status(429).json({ error: 'You’re sending a lot of messages. Wait a few minutes.', code: 'ai_rate' })
    const result = await chat(uid(req), req.body.messages)
    res.json({ ...result, usage: await getUsage(uid(req)) })
  } catch (error) {
    fail(res, error)
  }
})

const estimateSchema = z.object({ text: z.string().trim().min(2).max(600) })
aiRouter.post('/estimate-meal', validateRequest(estimateSchema), async (req, res) => {
  try {
    if (tooMany(uid(req))) return res.status(429).json({ error: 'You’re sending a lot of requests. Wait a few minutes.', code: 'ai_rate' })
    const result = await estimateMeal(uid(req), req.body.text)
    res.json({ ...result, usage: await getUsage(uid(req)) })
  } catch (error) {
    fail(res, error)
  }
})

aiRouter.post('/proposals/apply', validateRequest(idsSchema), async (req, res) => {
  try {
    res.json({ results: await applyProposals(uid(req), req.body.ids) })
  } catch (error) {
    fail(res, error)
  }
})

aiRouter.post('/proposals/dismiss', validateRequest(idsSchema), async (req, res) => {
  try {
    await dismissProposals(uid(req), req.body.ids)
    res.json({ ok: true })
  } catch (error) {
    fail(res, error)
  }
})

aiRouter.post('/request-more', async (req, res) => {
  try {
    await requestMore(uid(req))
    res.json({ ok: true })
  } catch (error) {
    fail(res, error)
  }
})
