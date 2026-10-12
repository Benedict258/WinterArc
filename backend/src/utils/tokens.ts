import crypto from 'crypto'

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex')
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/** Readable invite code like WA-7K3F-9XQ2 (no look-alike characters). */
export function inviteCodeString() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = (n: number) => Array.from(crypto.randomBytes(n), b => alphabet[b % alphabet.length]).join('')
  return `WA-${pick(4)}-${pick(4)}`
}
