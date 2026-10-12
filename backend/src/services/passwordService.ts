import crypto from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>

// scrypt (memory-hard, built into Node: no native dependency). Parameters are
// stored with each hash so they can be raised later without breaking old hashes.
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Your password can’t be your email address.'
  if (/^(.)\1+$/.test(password)) return 'Choose a less repetitive password.'
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P })
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = (stored ?? '').split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

/** A real hash to compare against when the account doesn't exist, so timing doesn't reveal which emails are registered. */
let decoy: Promise<string> | null = null
export const decoyHash = () => (decoy ??= hashPassword(crypto.randomBytes(16).toString('hex')))
