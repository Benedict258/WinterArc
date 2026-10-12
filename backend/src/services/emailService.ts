// Outgoing email through Resend's HTTP API (no SDK needed). Without RESEND_API_KEY
// (local dev, tests) messages are logged instead of sent, so links can be copied from the console.

export type Email = { to: string; subject: string; text: string; html?: string }
type Transport = (email: Email) => Promise<void>

const resendTransport: Transport = async email => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'WinterArc <onboarding@resend.dev>', to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  })
  if (!res.ok) throw new Error(`Email provider rejected the message (${res.status})`)
}

const consoleTransport: Transport = async email => {
  console.log(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`)
}

let transport: Transport | null = null
/** Tests swap this to capture messages. */
export const setEmailTransport = (t: Transport | null) => { transport = t }

export async function sendEmail(email: Email) {
  const active = transport ?? (process.env.RESEND_API_KEY ? resendTransport : consoleTransport)
  await active(email)
}

/** Base URL used in links inside emails (the web app's address). */
export function appUrl() {
  return (process.env.APP_URL || (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',')[0]).trim().replace(/\/$/, '')
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
