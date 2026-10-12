import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const UPDATED = '12 October 2026'

function Page({ title, children }: { title: string; children: ReactNode }) {
  const { config } = useAuth()
  const contact = config.supportEmail
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Back to WinterArc</Link>
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground mt-1">Last updated {UPDATED}. WinterArc is in private beta, so these terms may change; we’ll tell you about material changes.</p>
        </header>
        <div className="space-y-5 text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
          {children}
          <h2>Contact</h2>
          <p>{contact ? <>Questions, requests or complaints: <a className="text-primary hover:underline" href={`mailto:${contact}`}>{contact}</a>.</> : 'Questions, requests or complaints: contact the person who invited you to the beta.'}</p>
        </div>
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Policy">
      <p>WinterArc is a personal planner. This page says what we keep, why, who helps us run it, and how you stay in control.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your email, optional name, a salted hash of your password (never the password itself), or your Google account id if you use Google sign-in, and when you signed up and last used the app.</li>
        <li><b>What you put in the app:</b> threads, tasks, goals, wishlist items, Drop notes, links and files, your settings (time zone, day structure, planner rules, appearance, reminders).</li>
        <li><b>Devices:</b> if you turn on reminders we store your browser’s push address so we can send them.</li>
        <li><b>Technical:</b> a sign-in cookie, and your IP address briefly in server memory to limit abuse. We don’t use advertising or analytics trackers.</li>
      </ul>
      <h2>Why we use it</h2>
      <p>Only to run the service for you: sign you in, plan your days, sync between your devices, and send the reminders and emails you ask for (confirmation, password reset, and the daily summary if you switch it on). We don’t sell your data or use it for advertising, and we don’t read your tasks except to fix a problem you ask us about.</p>
      <h2>Who helps us run it</h2>
      <ul>
        <li>MongoDB Atlas: database.</li>
        <li>Render and Vercel: application hosting.</li>
        <li>Backblaze B2: storage for files you add to Drop.</li>
        <li>Resend: sending email.</li>
        <li>Google: sign-in, and calendar sync only if you connect it.</li>
        <li>Anthropic: only if you use the AI assistant. Then your messages and a summary of your plan (thread names, task titles, goals and settings) are sent to Anthropic to produce the answer. Nothing is sent unless you use the assistant, and it can only suggest changes; you approve each one.</li>
      </ul>
      <p>Your data may therefore be processed outside your country. These providers act on our instructions.</p>
      <h2>How long we keep it</h2>
      <p>Until you delete it or your account. Drop items expire on the date shown. Reminder logs are removed after 14 days. When you delete your account in Settings, your records, devices, tokens and stored files are erased straight away; backups held by our providers are overwritten on their normal schedule.</p>
      <h2>Your choices</h2>
      <ul>
        <li><b>Download</b> everything we hold about you: Settings → Privacy &amp; data.</li>
        <li><b>Delete</b> your account and data: Settings → Privacy &amp; data.</li>
        <li>Turn reminders or the daily email off at any time (every email has a stop link).</li>
        <li>Ask us to correct or explain anything we hold, using the contact below.</li>
      </ul>
      <h2>Cookies</h2>
      <p>One essential cookie keeps you signed in. The app also stores your preferences and a copy of your data in your browser so it works offline. Signing out clears the data copy.</p>
      <h2>Security</h2>
      <p>Passwords are hashed, connections are encrypted, each account’s data is isolated from every other, and sign-in attempts are rate limited. No service is perfectly secure; if something affecting you goes wrong we’ll tell you.</p>
      <h2>Children</h2>
      <p>WinterArc isn’t meant for children under 13, and we don’t knowingly create accounts for them.</p>
    </Page>
  )
}

export function TermsPage() {
  return (
    <Page title="Terms of Use">
      <p>By creating an account you agree to these terms.</p>
      <h2>The beta</h2>
      <p>WinterArc is an early version. It may change, have bugs, be unavailable, or lose data despite our care, so keep your own copy of anything important (Settings → Privacy &amp; data lets you download it). It is provided “as is”, without promises about availability or fitness for a purpose, and to the extent the law allows we aren’t liable for indirect or lost-profit losses.</p>
      <h2>Your account</h2>
      <ul>
        <li>Give accurate details and keep your password private. You’re responsible for what happens under your account.</li>
        <li>Invite codes are for the person they were given to; don’t share or sell them.</li>
      </ul>
      <h2>Your content</h2>
      <p>What you add is yours. You give us permission to store and process it only to run the service for you. Don’t upload anything unlawful or that you don’t have the right to share.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>No attempts to break, overload or probe the service, or to access other people’s data.</li>
        <li>No spam, malware or abuse through Drop, email or any other feature.</li>
        <li>No automated sign-ups.</li>
      </ul>
      <h2>Ending things</h2>
      <p>You can delete your account at any time in Settings. We may suspend or remove accounts that break these terms or put the service at risk, and we may end the beta with reasonable notice.</p>
      <h2>Changes</h2>
      <p>We may update these terms. If a change matters, we’ll tell you in the app or by email; using WinterArc after that means you accept it.</p>
    </Page>
  )
}
