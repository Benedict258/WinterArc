import { OAuth2Client } from 'google-auth-library'
import { User } from '../models/User'
import { EmailToken } from '../models/EmailToken'
import { InviteCode } from '../models/InviteCode'
import { ApiToken } from '../models/ApiToken'
import { Settings } from '../models/Settings'
import { hashPassword, verifyPassword, decoyHash, passwordProblem } from './passwordService'
import { TERMS_VERSION } from '../../../src/shared/legal'
import { sendEmail, verifyEmailMessage, resetPasswordMessage } from './emailService'
import { randomToken, hashToken } from '../utils/tokens'

export class AuthError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const NATIVE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000
const MAX_FAILED_LOGINS = 8
const LOCK_MS = 15 * 60 * 1000

/** Beta mode: sign-up needs an invite code. Turn off with INVITE_REQUIRED=false. */
export const inviteRequired = () => process.env.INVITE_REQUIRED !== 'false'

const isAdminEmail = (email: string) =>
  (process.env.ADMIN_EMAIL || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(email)

export type PublicUser = { id: string; email: string; name: string; role: string; emailVerified: boolean; onboarded: boolean }
export const toPublicUser = (u: any): PublicUser => ({
  id: String(u._id), email: u.email, name: u.name ?? '', role: u.role, emailVerified: !!u.emailVerifiedAt, onboarded: !!u.onboardedAt,
})

// ---------------------------------------------------------------- invites

/** Take one use of a code. Throws if the code is unknown, revoked, expired or used up. */
async function consumeInvite(code: string | undefined): Promise<string | null> {
  if (!inviteRequired()) return code?.trim().toUpperCase() || null
  const normalized = code?.trim().toUpperCase()
  if (!normalized) throw new AuthError(400, 'An invite code is required during the beta.', 'invite_required')
  const now = new Date()
  const taken = await InviteCode.findOneAndUpdate(
    { code: normalized, revokedAt: null, remaining: { $gt: 0 }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    { $inc: { remaining: -1 } },
    { new: true }
  )
  if (!taken) throw new AuthError(400, 'That invite code isn’t valid or has been used up.', 'invite_invalid')
  return normalized
}

async function refundInvite(code: string | null) {
  if (code && inviteRequired()) await InviteCode.updateOne({ code }, { $inc: { remaining: 1 } })
}

// ----------------------------------------------------------------- tokens

async function issueEmailToken(userId: unknown, kind: 'verify' | 'reset') {
  const token = randomToken()
  await EmailToken.create({
    userId, kind, tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + (kind === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS)),
  })
  return token
}

export async function sendVerification(user: any) {
  await EmailToken.deleteMany({ userId: user._id, kind: 'verify' })
  await sendEmail(verifyEmailMessage(user.email, await issueEmailToken(user._id, 'verify')))
}

/** A fresh bearer token for the native app. */
export async function issueNativeToken(userId: unknown) {
  const token = randomToken()
  await ApiToken.create({ userId, tokenHash: hashToken(token), label: 'native app', expiresAt: new Date(Date.now() + NATIVE_TOKEN_TTL_MS) })
  return token
}

// ----------------------------------------------------------------- signup

async function createDefaults(userId: unknown, timezone?: string) {
  await Settings.create({ userId, ...(timezone ? { timezone } : {}) })
}

export { TERMS_VERSION }

export async function signup(input: { email: string; password: string; name?: string; inviteCode?: string; timezone?: string; acceptTerms?: boolean }) {
  const problem = passwordProblem(input.password, input.email)
  if (problem) throw new AuthError(400, problem, 'weak_password')
  if (await User.exists({ email: input.email })) throw new AuthError(409, 'An account with that email already exists. Try signing in.', 'email_taken')

  const code = await consumeInvite(input.inviteCode)
  try {
    const user = await User.create({
      email: input.email,
      name: input.name ?? '',
      passwordHash: await hashPassword(input.password),
      signedUpWithCode: code,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      role: isAdminEmail(input.email) ? 'admin' : 'user',
    })
    await createDefaults(user._id, input.timezone)
    await sendVerification(user).catch(err => console.error('Verification email failed:', err instanceof Error ? err.message : err))
    return user
  } catch (error: any) {
    await refundInvite(code)
    if (error?.code === 11000) throw new AuthError(409, 'An account with that email already exists. Try signing in.', 'email_taken')
    throw error
  }
}

// ------------------------------------------------------------------ login

export async function login(email: string, password: string) {
  const user = await User.findOne({ email })
  if (!user || !user.passwordHash) {
    await verifyPassword(password, await decoyHash()) // same work either way
    throw new AuthError(401, 'Incorrect email or password.', 'bad_credentials')
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError(429, 'Too many attempts. Try again in a few minutes.', 'locked')
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = (user.failedLogins ?? 0) + 1
    await User.updateOne({ _id: user._id }, failed >= MAX_FAILED_LOGINS
      ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } }
      : { $set: { failedLogins: failed } })
    throw new AuthError(401, 'Incorrect email or password.', 'bad_credentials')
  }
  if (user.status !== 'active') throw new AuthError(403, 'This account is not active. Contact support.', 'suspended')
  await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), ...(isAdminEmail(user.email) && user.emailVerifiedAt ? { role: 'admin' } : {}) } })
  return user
}

// ----------------------------------------------------------------- google

let googleClient: OAuth2Client | null = null
/** Tests replace this so no network call is made. */
export let verifyGoogleToken: (credential: string) => Promise<{ sub: string; email: string; name?: string; emailVerified: boolean }> = async credential => {
  const audience = process.env.GOOGLE_CLIENT_ID
  if (!audience) throw new AuthError(503, 'Google sign-in isn’t configured.', 'google_unconfigured')
  googleClient ??= new OAuth2Client(audience)
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience })
  const p = ticket.getPayload()
  if (!p?.sub || !p.email) throw new AuthError(401, 'Google sign-in failed.', 'google_failed')
  return { sub: p.sub, email: p.email.toLowerCase(), name: p.name, emailVerified: !!p.email_verified }
}
export const setGoogleVerifier = (fn: typeof verifyGoogleToken) => { verifyGoogleToken = fn }

export async function googleLogin(credential: string, inviteCode?: string, timezone?: string, acceptTerms?: boolean) {
  let profile
  try {
    profile = await verifyGoogleToken(credential)
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError(401, 'Google sign-in failed.', 'google_failed')
  }
  if (!profile.emailVerified) throw new AuthError(401, 'Your Google email isn’t verified.', 'google_unverified')

  let user = await User.findOne({ googleId: profile.sub }) ?? await User.findOne({ email: profile.email })
  if (user) {
    if (user.status !== 'active') throw new AuthError(403, 'This account is not active. Contact support.', 'suspended')
    // Linking by email is safe: Google vouches for the address
    await User.updateOne({ _id: user._id }, { $set: { googleId: profile.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date(), lastLoginAt: new Date(), ...(isAdminEmail(user.email) ? { role: 'admin' } : {}) } })
    return (await User.findOne({ _id: user._id }))!
  }
  if (!acceptTerms) throw new AuthError(400, 'Create an account first and accept the terms, then use Google.', 'terms_required')
  const code = await consumeInvite(inviteCode)
  try {
    user = await User.create({
      termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
      email: profile.email, name: profile.name ?? '', googleId: profile.sub, emailVerifiedAt: new Date(),
      signedUpWithCode: code, role: isAdminEmail(profile.email) ? 'admin' : 'user', lastLoginAt: new Date(),
    })
    await createDefaults(user._id, timezone)
    return user
  } catch (error) {
    await refundInvite(code)
    throw error
  }
}

// ---------------------------------------------------------- email links

async function takeToken(token: string, kind: 'verify' | 'reset') {
  // Atomic: a link can be used once even if clicked twice at the same moment
  const doc = await EmailToken.findOneAndUpdate(
    { tokenHash: hashToken(token), kind, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  )
  if (!doc) throw new AuthError(400, 'That link is invalid or has expired.', 'bad_token')
  return doc
}

export async function verifyEmail(token: string) {
  const doc = await takeToken(token, 'verify')
  await User.updateOne({ _id: doc.userId }, { $set: { emailVerifiedAt: new Date() } })
  const user = await User.findOne({ _id: doc.userId })
  if (user && isAdminEmail(user.email)) await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } })
  return user
}

/** Always succeeds from the caller's point of view, so it can't be used to find out who has an account. */
export async function forgotPassword(email: string) {
  const user = await User.findOne({ email })
  if (!user || user.status !== 'active') return
  await EmailToken.deleteMany({ userId: user._id, kind: 'reset' })
  await sendEmail(resetPasswordMessage(user.email, await issueEmailToken(user._id, 'reset')))
}

export async function resetPassword(token: string, password: string) {
  const peek = await EmailToken.findOne({ tokenHash: hashToken(token), kind: 'reset', usedAt: null, expiresAt: { $gt: new Date() } })
  if (!peek) throw new AuthError(400, 'That link is invalid or has expired.', 'bad_token')
  const owner = await User.findOne({ _id: peek.userId })
  const problem = passwordProblem(password, owner?.email)
  if (problem) throw new AuthError(400, problem, 'weak_password') // token stays usable
  const doc = await takeToken(token, 'reset')
  await User.updateOne({ _id: doc.userId }, {
    $set: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, emailVerifiedAt: owner?.emailVerifiedAt ?? new Date() },
    $inc: { sessionVersion: 1 }, // signs out every existing session
  })
  await ApiToken.deleteMany({ userId: doc.userId })
  return User.findOne({ _id: doc.userId })
}
