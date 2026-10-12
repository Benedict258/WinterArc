import { Router, type Request, type Response } from 'express'
import { validateRequest } from '../middleware/validationMiddleware'
import { requireAuth } from '../middleware/auth'
import {
  signupSchema, loginSchema, googleLoginSchema, tokenSchema, forgotPasswordSchema, resetPasswordSchema,
} from '../utils/validation'
import {
  AuthError, signup, login, googleLogin, verifyEmail, forgotPassword, resetPassword,
  sendVerification, issueNativeToken, toPublicUser, inviteRequired,
} from '../services/authService'
import { aiConfigured, provider } from '../services/aiService'
import { TERMS_VERSION } from '../../../src/shared/legal'
import { User } from '../models/User'
import { ApiToken } from '../models/ApiToken'
import { hashToken } from '../utils/tokens'

// Throttle by IP so one address can't hammer sign-up, login or reset emails.
// (Per-account lockout lives in authService.) In-memory: fine for one instance.
const hits = new Map<string, { count: number; first: number }>()
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || now - entry.first > windowMs) {
    hits.set(key, { count: 1, first: now })
    return false
  }
  entry.count++
  return entry.count > max
}
export const resetRateLimits = () => hits.clear()

const rateLimit = (name: string, max: number, windowMs: number) => (req: Request, res: Response, next: () => void) => {
  if (process.env.NODE_ENV !== 'test' && limited(`${name}:${req.ip}`, max, windowMs)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' })
  }
  next()
}

function fail(res: Response, error: unknown) {
  if (error instanceof AuthError) return res.status(error.status).json({ error: error.message, code: error.code })
  console.error('Auth error:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}

/** Signs the user in: a session cookie for the web, a bearer token for the native app. */
async function start(req: Request, res: Response, user: any, client?: string) {
  const body = { ok: true, user: toPublicUser(user) }
  if (client === 'native') {
    return res.json({ ...body, token: await issueNativeToken(user._id) })
  }
  // New session id on login (prevents session fixation)
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())))
  req.session.userId = String(user._id)
  req.session.sessionVersion = user.sessionVersion ?? 0
  await new Promise<void>(resolve => req.session.save(() => resolve()))
  return res.json(body)
}

export const authRouter = Router()

authRouter.get('/config', (_req, res) => {
  res.json({ inviteRequired: inviteRequired(), googleClientId: process.env.GOOGLE_CLIENT_ID || null, supportEmail: process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || null, aiProvider: aiConfigured() ? provider().label : null, legalName: process.env.LEGAL_NAME || null, jurisdiction: process.env.LEGAL_JURISDICTION || null, termsVersion: TERMS_VERSION })
})

authRouter.post('/signup', rateLimit('signup', 10, 60 * 60 * 1000), validateRequest(signupSchema), async (req, res) => {
  try {
    const user = await signup(req.body)
    await start(req, res, user, req.body.client)
  } catch (error) {
    fail(res, error)
  }
})

authRouter.post('/login', rateLimit('login', 30, 15 * 60 * 1000), validateRequest(loginSchema), async (req, res) => {
  try {
    const user = await login(req.body.email, req.body.password)
    await start(req, res, user, req.body.client)
  } catch (error) {
    fail(res, error)
  }
})

authRouter.post('/google', rateLimit('google', 30, 15 * 60 * 1000), validateRequest(googleLoginSchema), async (req, res) => {
  try {
    const user = await googleLogin(req.body.credential, req.body.inviteCode, req.body.timezone, req.body.acceptTerms)
    await start(req, res, user, req.body.client)
  } catch (error) {
    fail(res, error)
  }
})

authRouter.post('/logout', async (req, res) => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) await ApiToken.deleteOne({ tokenHash: hashToken(header.slice(7).trim()) }).catch(() => {})
  req.session.destroy(() => {
    res.clearCookie('winterarc.sid')
    res.json({ ok: true })
  })
})

authRouter.get('/me', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return res.json({ authenticated: false })
  const user = await User.findOne({ _id: req.user.id })
  res.json({ authenticated: true, user: user ? toPublicUser(user) : null })
})

authRouter.post('/verify-email', rateLimit('verify', 30, 15 * 60 * 1000), validateRequest(tokenSchema), async (req, res) => {
  try {
    const user = await verifyEmail(req.body.token)
    res.json({ ok: true, user: user ? toPublicUser(user) : null })
  } catch (error) {
    fail(res, error)
  }
})

authRouter.post('/resend-verification', requireAuth, rateLimit('resend', 5, 60 * 60 * 1000), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user!.id })
    if (user && !user.emailVerifiedAt) await sendVerification(user)
    res.json({ ok: true })
  } catch (error) {
    fail(res, error)
  }
})

authRouter.post('/forgot-password', rateLimit('forgot', 5, 60 * 60 * 1000), validateRequest(forgotPasswordSchema), async (req, res) => {
  try {
    await forgotPassword(req.body.email)
    res.json({ ok: true }) // same answer whether or not the account exists
  } catch (error) {
    console.error('Forgot-password failed:', error instanceof Error ? error.message : error)
    res.json({ ok: true })
  }
})

authRouter.post('/reset-password', rateLimit('reset', 10, 60 * 60 * 1000), validateRequest(resetPasswordSchema), async (req, res) => {
  try {
    await resetPassword(req.body.token, req.body.password)
    res.json({ ok: true })
  } catch (error) {
    fail(res, error)
  }
})
