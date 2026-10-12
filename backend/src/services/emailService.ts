import { createHmac, timingSafeEqual } from 'crypto'

// Outgoing email through Resend's HTTP API (no SDK needed). Without RESEND_API_KEY
// (local dev, tests) messages are logged instead of sent, so links can be copied from the console.

export type Email = { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }
type Transport = (email: Email) => Promise<void>

const resendTransport: Transport = async email => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'WinterArc <onboarding@resend.dev>', to: [email.to], subject: email.subject, text: email.text, html: email.html, headers: email.headers }),
  })
  if (!res.ok) throw Object.assign(new Error(`Email provider rejected the message (${res.status})`), { status: res.status })
}

const consoleTransport: Transport = async email => {
  console.log(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`)
}

let transport: Transport | null = null
/** Tests swap this to capture messages. */
export const setEmailTransport = (t: Transport | null) => { transport = t }

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
export const emailRetryDelayMs = { value: 1500 }

/** Sends with one retry for network errors and provider 5xx/429; other rejections (bad address, bad key) fail at once. */
export async function sendEmail(email: Email) {
  const active = transport ?? (process.env.RESEND_API_KEY ? resendTransport : consoleTransport)
  try {
    await active(email)
  } catch (error: any) {
    const status = error?.status
    const transient = status === undefined || status === 429 || status >= 500
    if (!transient) throw error
    await wait(emailRetryDelayMs.value)
    await active(email)
  }
}

/** Base URL used in links inside emails (the web app's address). */
export function appUrl() {
  return (process.env.APP_URL || (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',')[0]).trim().replace(/\/$/, '')
}

function unsubscribeSignature(userId: string) {
  return createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret').update(`unsubscribe-digest:${userId}`).digest('hex')
}
export const unsubscribeUrl = (userId: string) => `${appUrl()}/api/email/unsubscribe?u=${userId}&s=${unsubscribeSignature(userId)}`
export function validUnsubscribe(userId: string, signature: string) {
  const expected = Buffer.from(unsubscribeSignature(userId))
  const given = Buffer.from(String(signature))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function layout(title: string, body: string, linkUrl: string, linkLabel: string) {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2><p style="line-height:1.5">${body}</p>
<p><a href="${escapeHtml(linkUrl)}" style="display:inline-block;background:#5b8def;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(linkLabel)}</a></p>
<p style="color:#667;font-size:12px">If the button doesn't work, copy this link: ${escapeHtml(linkUrl)}</p></div>`
}

export function verifyEmailMessage(to: string, token: string): Email {
  const url = `${appUrl()}/verify-email?token=${token}`
  return {
    to,
    subject: 'Confirm your email for WinterArc',
    text: `Welcome to WinterArc. Confirm your email address:\n${url}\n\nThis link works for 24 hours. If you didn't sign up, ignore this message.`,
    html: layout('Confirm your email', 'Welcome to WinterArc. Confirm your email address to finish setting up your account.', url, 'Confirm email'),
  }
}

export function resetPasswordMessage(to: string, token: string): Email {
  const url = `${appUrl()}/reset-password?token=${token}`
  return {
    to,
    subject: 'Reset your WinterArc password',
    text: `Choose a new password:\n${url}\n\nThis link works for 1 hour. If you didn't ask for this, ignore this message and your password stays the same.`,
    html: layout('Reset your password', 'Use the button below to choose a new password. It works for one hour.', url, 'Choose a new password'),
  }
}

export function digestMessage(to: string, userId: string, d: { subject: string; lines: string[]; events: string[]; dueToday: number; overdue: number }): Email {
  const unsubscribe = unsubscribeUrl(userId)
  const due = [d.dueToday ? `${d.dueToday} due today` : '', d.overdue ? `${d.overdue} overdue` : ''].filter(Boolean).join(', ')
  const text = [
    d.subject,
    '',
    ...(d.lines.length ? ['Tasks', ...d.lines.map(l => `- ${l}`), ''] : []),
    ...(d.events.length ? ['Events', ...d.events.map(l => `- ${l}`), ''] : []),
    ...(due ? [due, ''] : []),
    `Open WinterArc: ${appUrl()}`,
    '',
    `Stop these emails: ${unsubscribe}`,
  ].join('\n')
  const list = (title: string, items: string[]) => items.length ? `<h3 style="margin:16px 0 4px">${title}</h3><ul style="padding-left:18px;margin:0">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
<h2 style="margin:0 0 8px">${escapeHtml(d.subject)}</h2>${list('Tasks', d.lines)}${list('Events', d.events)}${due ? `<p>${escapeHtml(due)}</p>` : ''}
<p><a href="${escapeHtml(appUrl())}" style="display:inline-block;background:#5b8def;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open WinterArc</a></p>
<p style="color:#667;font-size:12px">You get this because you turned on the daily email. <a href="${escapeHtml(unsubscribe)}">Stop these emails</a></p></div>`
  return { to, subject: d.subject, text, html, headers: { 'List-Unsubscribe': `<${unsubscribe}>` } }
}

export function partnerInviteMessage(to: string, from: { name: string; email: string }, hasAccount: boolean): Email {
  const who = from.name || from.email
  const url = appUrl()
  const text = hasAccount
    ? `${who} (${from.email}) asked you to be their accountability partner on WinterArc.\n\nOpen the Partners page to accept or decline: ${url}/partners\n\nYou choose what you share with them; nothing is shared until you accept.`
    : `${who} (${from.email}) invited you to be their accountability partner on WinterArc, a daily planner.\n\nWinterArc is in private beta, so you'll need an invite code to join: ask ${who}. Once you have an account with this email address, the request will be waiting on the Partners page: ${url}/partners`
  return {
    to,
    subject: `${who} invited you to WinterArc`,
    text,
    html: layout(`${who} wants an accountability partner`, hasAccount ? 'Open WinterArc to accept or decline. Nothing is shared until you accept, and you choose what you share.' : 'WinterArc is in private beta, so you’ll need an invite code to join: ask them. Once you have an account with this email address, the request will be waiting for you.', `${url}/partners`, 'Open WinterArc'),
  }
}

export function threadInviteMessage(to: string, from: { name: string; email: string }, threadName: string, role: 'editor' | 'viewer', hasAccount: boolean): Email {
  const who = from.name || from.email
  const url = appUrl()
  const what = role === 'editor' ? 'to work on' : 'to follow'
  const text = hasAccount
    ? `${who} (${from.email}) invited you ${what} the shared thread “${threadName}” on WinterArc.\n\nOpen the Threads page to accept or decline: ${url}/threads`
    : `${who} (${from.email}) invited you ${what} the shared thread “${threadName}” on WinterArc, a daily planner.\n\nWinterArc is in private beta, so you'll need an invite code to join: ask ${who}. Once you have an account with this email address, the invitation will be waiting on the Threads page: ${url}/threads`
  return {
    to,
    subject: `${who} shared a thread with you on WinterArc`,
    text,
    html: layout(`${who} shared “${threadName}” with you`, hasAccount ? 'Open WinterArc to accept or decline.' : 'WinterArc is in private beta, so you’ll need an invite code to join: ask them. Once you have an account with this email address, the invitation will be waiting for you.', `${url}/threads`, 'Open WinterArc'),
  }
}

export function planEndingMessage(to: string, endsOn: string): Email {
  const url = `${appUrl()}/billing`
  return {
    to,
    subject: 'Your WinterArc Pro plan ends soon',
    text: `Your WinterArc Pro plan ends on ${endsOn}. After that you'll go back to the free plan: your data stays, but new files, threads and shared people are limited to the free allowance.\n\nExtend it any time: ${url}`,
    html: layout('Your Pro plan ends soon', `It ends on ${endsOn}. After that you’ll go back to the free plan: your data stays, but adding new files, threads and shared people is limited to the free allowance.`, url, 'Extend Pro'),
  }
}

export function paymentReceiptMessage(to: string, months: number, until: string, amount: string): Email {
  const url = `${appUrl()}/billing`
  return {
    to,
    subject: 'Thanks for upgrading WinterArc',
    text: `Payment received (${amount}). Your Pro plan now runs until ${until}.\n\nSee your plan: ${url}`,
    html: layout('Thanks, you’re on Pro', `Payment received (${amount}). Your Pro plan now runs until ${until}.`, url, 'See your plan'),
  }
}
