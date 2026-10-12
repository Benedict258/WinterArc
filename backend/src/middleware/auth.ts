import type { Request, Response, NextFunction } from 'express'
import { User } from '../models/User'
import { ApiToken } from '../models/ApiToken'
import { hashToken } from '../utils/tokens'

export type AuthUser = { id: string; email: string; role: 'user' | 'admin'; emailVerified: boolean }

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string
    sessionVersion?: number
  }
}

const bearer = (req: Request) => {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null
}

/**
 * Works out who is calling (session cookie on the web, bearer token in the native
 * app) and attaches `req.user`. Never rejects by itself; see requireAuth.
 * Suspended or deleted accounts, and sessions from before a password reset, are treated as logged out.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    let userId: string | null = null
    let sessionVersion: number | null = null

    if (req.session?.userId) {
      userId = req.session.userId
      sessionVersion = req.session.sessionVersion ?? 0
    } else {
      const token = bearer(req)
      if (token) {
        const row = await ApiToken.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
        if (row) userId = String(row.userId)
      }
    }

    if (userId) {
      const user = await User.findOne({ _id: userId })
      const versionOk = sessionVersion === null || sessionVersion === user?.sessionVersion
      if (user && user.status === 'active' && versionOk) {
        const hourAgo = Date.now() - 60 * 60 * 1000
        if (!user.lastSeenAt || user.lastSeenAt.getTime() < hourAgo) {
          void User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {})
        }
        req.user = { id: String(user._id), email: user.email, role: user.role as 'user' | 'admin', emailVerified: !!user.emailVerifiedAt }
      }
    }
  } catch (error) {
    console.error('Auth lookup failed:', error instanceof Error ? error.message : error)
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.user) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

/** Some features (push, sharing) need a confirmed email address. */
export function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (!req.user.emailVerified) return res.status(403).json({ error: 'Please confirm your email address first.', code: 'email_unverified' })
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  next()
}

/** Current user's id; only call behind requireAuth. */
export const uid = (req: Request) => req.user!.id
