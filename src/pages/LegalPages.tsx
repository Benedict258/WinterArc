import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { LEGAL_UPDATED_LABEL } from '@/shared/legal'

type Section = { id: string; title: string; body: ReactNode }

const link = 'text-primary hover:underline'

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead><tr>{head.map(h => <th key={h} className="text-left font-medium py-1.5 pr-4 border-b border-border text-foreground break-normal">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`py-1.5 pr-4 border-b border-border/60 align-top text-muted-foreground break-normal ${j === 0 ? 'min-w-[7rem]' : ''}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/** A readable long-form page with a contents list. */
function Page({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
  const { config } = useAuth()
  const contact = config.supportEmail
  const all: Section[] = [
    ...sections,
    {
      id: 'contact', title: 'Contact',
      body: <p>{contact ? <>Questions, requests or complaints: <a className={link} href={`mailto:${contact}`}>{contact}</a>.</> : 'Questions, requests or complaints: contact the person who invited you to the beta.'}{config.legalName ? <> WinterArc is run by {config.legalName}.</> : null}</p>,
    },
  ]
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Back to WinterArc</Link>
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">Last updated {LEGAL_UPDATED_LABEL}. WinterArc is in private beta; if we change this in a way that matters we’ll tell you in the app or by email.</p>
          <div className="text-sm text-muted-foreground">{intro}</div>
        </header>
        <nav aria-label="Contents" className="rounded-lg border border-border p-4 bg-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contents</p>
          <ol className="text-sm space-y-1 list-decimal pl-5">
            {all.map(s => <li key={s.id}><a className={link} href={`#${s.id}`}>{s.title}</a></li>)}
          </ol>
        </nav>
        <div className="space-y-8 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_b]:text-foreground">
          {all.map((s, i) => (
            <section key={s.id} id={s.id} className="space-y-2 scroll-mt-6">
              <h2 className="text-base font-semibold text-foreground">{i + 1}. {s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PrivacyPage() {
  const { config } = useAuth()
  const ai = config.aiProvider ?? 'the AI provider this server uses'
  return (
    <Page
      title="Privacy Policy"
      intro={<p>WinterArc is a personal planner. This page explains in plain language what we keep about you, why, who helps us run it, how long we keep it, and how you stay in control. We don’t sell your data and we don’t show ads.</p>}
      sections={[
        {
          id: 'collect', title: 'What we collect',
          body: (
            <>
              <Table head={['What', 'Details']} rows={[
                [<b key="a">Account</b>, 'Your email address, an optional name, a salted hash of your password (never the password), or your Google account id if you sign in with Google; whether your email is confirmed; the invite code you used; when you accepted these terms; when you signed up, last signed in and were last seen.'],
                [<b key="b">What you add</b>, 'Threads, tasks, goals, wishlist items, notes, Drop text, links and files, and your settings (time zone, day structure, planner rules, look and feel, reminders, which features are on).'],
                [<b key="h">Habits, focus and routines</b>, 'Your habits and the days you checked them off, your focus (Pomodoro) rounds, and your routines.'],
                [<b key="i">Health and fitness</b>, 'If you use Fitness: workouts you log, steps (typed, or read from Android Health Connect if you connect it: daily step totals, weight and resting heart rate only), weight, sleep, resting heart rate, waist and mood entries, and your goals. This is health information; you choose what to enter and can delete any of it. We never write to Health Connect.'],
                [<b key="j">Food</b>, 'If you use Nutrition: the meals you log with their estimated calories and nutrients, and your goals, way of eating and foods to avoid.'],
                [<b key="c">Reminders</b>, 'If you turn on notifications: your browser’s or device’s push address, the browser name it came from, and a short record of which reminders were sent (kept 14 days) so none is sent twice. If you turn on the daily email: that choice and its time.'],
                [<b key="d">Partners and sharing</b>, 'Partner invitations and the email address they were sent to, who accepted, what each person chose to share, and the last few “cheers”. For shared threads: who is a member, their role, and who each team task is assigned to.'],
                [<b key="e">AI assistant</b>, 'Only if you use it: your messages, how many tokens you have used this month, and any changes it suggested (kept for 7 days so you can approve or dismiss them). The conversation itself is kept on your device, not on our server.'],
                [<b key="f">Payments</b>, 'If paid plans are switched on: the payment reference, amount, currency, date and which plan period it bought. We never see your card.'],
                [<b key="g">Technical</b>, 'Your IP address is held briefly in server memory to limit abuse such as repeated sign-in attempts, and our hosting providers keep ordinary server logs. We don’t use advertising or analytics trackers.'],
              ]} />
              <p>Files you import (CSV, Todoist, Notion, a WinterArc export) are read in your browser; only the rows you choose to import are sent to us.</p>
            </>
          ),
        },
        {
          id: 'use', title: 'Why we use it',
          body: (
            <ul>
              <li>To run the service for you: sign you in, plan your days, keep your devices in sync and work offline.</li>
              <li>To send what you ask for: confirmation and password-reset emails, reminders, the daily email, invitations you send, receipts.</li>
              <li>To keep it safe and fair: limit abuse, enforce storage and AI allowances, investigate problems you report.</li>
              <li>We don’t read your tasks except to fix a problem you ask us about. We don’t use your content to train AI models.</li>
            </ul>
          ),
        },
        {
          id: 'share', title: 'Who else sees it',
          body: (
            <>
              <p><b>People you choose.</b> An accountability partner sees only what you tick for them (streak, weekly counts, thread names, today’s task titles); nothing is shared until they accept, and you can change it any time. People in a thread you share see its name and its team tasks (title, status, due date, priority and who has it), never your planned days, notes or resources.</p>
              <p><b>Service providers</b> process data for us, only to provide the service:</p>
              <Table head={['Provider', 'For what']} rows={[
                ['MongoDB Atlas', 'Our database'],
                ['Render', 'Runs the server'],
                ['Vercel', 'Serves the website'],
                ['Backblaze B2', 'Stores files you add to Drop'],
                ['Resend', 'Sends our emails'],
                ['Google', 'Sign-in with Google, if you use it'],
                [config.aiProvider ?? 'An AI provider', <>Only if you use the assistant or ask for a meal estimate: your messages and a summary of your plan (thread names, task titles, goals, habits, settings) go to {ai} to produce each answer. If you ask about fitness or food, that information goes too.</>],
                ['Paystack', 'Takes payments, if paid plans are switched on'],
              ]} />
              <p>We may also share information if the law requires it. We never sell personal data.</p>
            </>
          ),
        },
        {
          id: 'keep', title: 'How long we keep it',
          body: (
            <>
              <Table head={['Data', 'Kept']} rows={[
                ['Account and what you add', 'Until you delete it or your account'],
                ['Drop items', '30 days from when they are added, unless you set a different date; files are removed from storage soon after'],
                ['Assistant suggestions', '7 days'],
                ['Reminder records', '14 days'],
                ['Confirmation and reset links', 'Short-lived, single use'],
                ['Payment records', 'For as long as accounting rules require, even after an account is deleted'],
                ['Backups', 'Held by our providers and overwritten on their normal schedule'],
              ]} />
              <p>When you delete your account (Settings → Privacy &amp; account, or see <a className={link} href="/delete-account">account deletion</a>) your records, files, devices, tokens, partnerships and memberships are erased straight away.</p>
            </>
          ),
        },
        {
          id: 'device', title: 'Cookies and storage on your device',
          body: (
            <>
              <Table head={['Item', 'Why']} rows={[
                [<code key="c">winterarc.sid</code>, 'One essential sign-in cookie. Nothing else is set by cookie.'],
                ['Local storage', 'Remembers your theme, accent, density, the menu state, who is signed in, and your assistant conversation.'],
                ['IndexedDB', 'A copy of your threads, tasks, goals and settings so the app works offline, plus changes waiting to sync.'],
                ['Service worker', 'Lets the app open offline and receive reminders.'],
              ]} />
              <p>Signing out removes your cached data and conversation from that device. On the Android app these live inside the app and the sign-in token is kept out of Android’s cloud backup.</p>
            </>
          ),
        },
        {
          id: 'rights', title: 'Your choices and rights',
          body: (
            <>
              <ul>
                <li><b>See and download</b> everything we hold about you: Settings → Data Management → Export.</li>
                <li><b>Correct</b> anything in the app, or ask us.</li>
                <li><b>Delete</b> your account and data: Settings → Privacy &amp; account.</li>
                <li><b>Turn off</b> reminders, the daily email (every email has a stop link), the assistant and other features in Settings.</li>
                <li><b>Object or restrict</b> how we use your data, or ask a question, using the contact details below.</li>
              </ul>
              <p>Depending on where you live (for example under the Nigeria Data Protection Act or the GDPR) you may have further rights, including to complain to your data protection authority. We’ll answer requests within a month.</p>
            </>
          ),
        },
        {
          id: 'security', title: 'How we protect it',
          body: (
            <ul>
              <li>Passwords are hashed with a slow, salted function; sign-in is rate limited and accounts lock after repeated failures.</li>
              <li>Connections are encrypted. Each account’s data is kept apart from everyone else’s and checked on every request.</li>
              <li>Email links and tokens are single-use and expire; signing out everywhere is possible after a password reset.</li>
              <li>Admins can see account details and usage numbers, not your tasks, and their actions are logged.</li>
            </ul>
          ),
        },
        {
          id: 'transfers', title: 'Where it is processed',
          body: <p>Our providers run in several countries, so your data may be processed outside the one you live in. We choose providers that protect it to a comparable standard and that act only on our instructions.</p>,
        },
        {
          id: 'children', title: 'Children',
          body: <p>WinterArc isn’t for children under 13 (or under 16 where your law sets a higher age for consent). We don’t knowingly create accounts for them; if you think one exists, tell us and we’ll delete it.</p>,
        },
        {
          id: 'changes', title: 'Changes to this policy',
          body: <p>We’ll update this page when what we do changes, and change the date at the top. If a change matters to you we’ll tell you in the app or by email before it takes effect.</p>,
        },
      ]}
    />
  )
}

export function TermsPage() {
  const { config } = useAuth()
  return (
    <Page
      title="Terms of Use"
      intro={<p>By creating an account or using WinterArc you agree to these terms. If you don’t agree, please don’t use it. See also the <a className={link} href="/privacy">Privacy Policy</a>.</p>}
      sections={[
        {
          id: 'service', title: 'The service and the beta',
          body: <p>WinterArc is a planner for your threads, tasks and days. It is an early version in private beta, so features may change or disappear, it may be unavailable at times, and despite our care data could be lost. Keep your own copy of anything important: Settings → Data Management → Export. The service is provided “as is”.</p>,
        },
        {
          id: 'accounts', title: 'Your account',
          body: (
            <ul>
              <li>You must be at least 13 (or older where your law says so) and able to agree to these terms.</li>
              <li>Give accurate details, keep your password private, and tell us if you think someone else has access. You’re responsible for what happens under your account.</li>
              <li>Invite codes are for the person they were given to. Don’t sell, share publicly or abuse them, and don’t create accounts automatically.</li>
              <li>One person, one account.</li>
            </ul>
          ),
        },
        {
          id: 'content', title: 'Your content',
          body: <p>What you add is yours. You give us permission to store, process and display it only as needed to run the service for you and the people you choose to share it with. Don’t add anything unlawful, or anything you don’t have the right to use. You can export or delete your content at any time.</p>,
        },
        {
          id: 'sharing', title: 'Partners and shared threads',
          body: (
            <ul>
              <li>You choose who you invite and what they see. Only invite people who’d expect it, and never use invitations to spam or harass anyone.</li>
              <li>What you share with a partner or team can be seen by them, and we can’t take back what someone has already seen.</li>
              <li>The owner of a shared thread can add and remove people and decides what roles they have. Removing someone, or leaving, takes tasks out of the thread but doesn’t delete them.</li>
            </ul>
          ),
        },
        {
          id: 'ai', title: 'The AI assistant',
          body: (
            <ul>
              <li>The assistant can be wrong. Check what it suggests; it can’t change anything until you approve each suggestion.</li>
              <li>Don’t rely on it for medical, legal, financial or safety decisions.</li>
              <li><b>Fitness and food.</b> Workout, step and nutrition features and the assistant’s suggestions are general information, not medical advice. Calorie and nutrient numbers are estimates and can be wrong. We are not doctors or dietitians. Talk to a professional before changing your diet or exercise if you have a health condition, are pregnant, take medicine, have or may have an eating disorder, or feel unwell. Stop exercising and get help if you feel pain or dizziness. In an emergency, call your local emergency number.</li>
              <li>When you use it, your messages and a summary of your plan are sent to {config.aiProvider ?? 'our AI provider'} (see the Privacy Policy). Don’t put in anything you don’t want processed that way.</li>
              <li>Each account has a monthly and daily allowance. We may change allowances, and can pause the assistant for an account that abuses it.</li>
            </ul>
          ),
        },
        {
          id: 'use', title: 'Acceptable use',
          body: (
            <>
              <p>Don’t:</p>
              <ul>
                <li>break, overload, probe or reverse-engineer the service, or try to reach anyone else’s data;</li>
                <li>use it to send spam, malware or abusive messages (including through Drop, invitations or email);</li>
                <li>upload illegal content or content that infringes someone’s rights;</li>
                <li>get around limits on storage, threads, partners, AI use or invitations;</li>
                <li>use it in a way that breaks the law.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'plans', title: 'Free and paid plans',
          body: (
            <ul>
              <li>The Free plan has limits on storage, threads, partners, shared people and AI use; the limits are shown in the app.</li>
              <li>If paid plans are available, the price is shown before you pay. A paid plan is bought for a fixed period (for example one month or one year) and does <b>not</b> renew automatically; we’ll email you before it ends.</li>
              <li>Payments are processed by our payment provider. They aren’t refundable once the period has started, except where the law requires or where we decide otherwise; contact us if something went wrong.</li>
              <li>When a paid period ends you return to the Free plan. Your data stays, but you can’t add past the Free limits until you free up room or renew.</li>
              <li>We may change prices and limits for future periods, and will tell you first.</li>
            </ul>
          ),
        },
        {
          id: 'availability', title: 'Availability and changes',
          body: <p>We work to keep WinterArc running but don’t promise it will always be available or error-free. We may add, change or remove features, and may end the beta with reasonable notice.</p>,
        },
        {
          id: 'ending', title: 'Ending things',
          body: (
            <>
              <p>You can stop using WinterArc and delete your account at any time. We may suspend or close an account that breaks these terms, puts others or the service at risk, or is unpaid where payment is due; where we can, we’ll tell you why first. When an account is deleted its data is erased as described in the Privacy Policy.</p>
            </>
          ),
        },
        {
          id: 'ip', title: 'Our rights',
          body: <p>The WinterArc app, design, name and code belong to us or our licensors. You may use the service as these terms allow, but not copy or resell it. If you send us feedback we may use it without owing you anything.</p>,
        },
        {
          id: 'liability', title: 'Disclaimers and liability',
          body: (
            <>
              <p>To the extent the law allows: WinterArc is provided without warranties of any kind, including that it will be uninterrupted, error-free or suited to a particular purpose. We aren’t liable for indirect or consequential losses, lost profits, or lost data, and our total liability for anything arising from the service is limited to what you paid us in the 12 months before the claim (or, if you paid nothing, to a nominal amount).</p>
              <p>Nothing in these terms limits liability that can’t be limited by law, or any rights you have as a consumer that can’t be waived.</p>
            </>
          ),
        },
        {
          id: 'law', title: 'Governing law',
          body: <p>{config.jurisdiction ? <>These terms are governed by the laws of {config.jurisdiction}, and disputes go to its courts, without affecting any mandatory consumer rights where you live.</> : 'These terms are governed by the laws of the country where the person running WinterArc is based, without affecting any mandatory consumer rights where you live.'}</p>,
        },
        {
          id: 'changes', title: 'Changes to these terms',
          body: <p>We may update these terms. If a change matters, we’ll tell you in the app or by email before it takes effect, and you may be asked to accept it again. Using WinterArc after that means you accept the new terms.</p>,
        },
      ]}
    />
  )
}

export function DeleteAccountPage() {
  const { config } = useAuth()
  return (
    <Page
      title="Delete your WinterArc account"
      intro={<p>You can delete your account and everything in it yourself, at any time. It takes under a minute.</p>}
      sections={[
        {
          id: 'how', title: 'How to delete it',
          body: (
            <ul>
              <li>Sign in to WinterArc (the app or the website).</li>
              <li>Open <b>Settings</b>, then <b>Privacy &amp; account</b>, then <b>Delete my account</b>.</li>
              <li>Type your email address (and your password, if you use one) to confirm.</li>
            </ul>
          ),
        },
        {
          id: 'deleted', title: 'What is deleted',
          body: <p>Straight away and permanently: your account, threads, tasks, goals, wishlist, Drop items and uploaded files, settings, reminders and registered devices, AI assistant usage and suggestions, partner connections and the shared-thread memberships you hold. Tasks you gave to other people in threads you shared stay with them, outside the thread. Your assistant conversation and cached data on the device you used are cleared too.</p>,
        },
        {
          id: 'kept', title: 'What is kept',
          body: <p>If you paid for a plan, our payment records (reference, amount and date) are kept for accounting. Backups held by our hosting providers are overwritten on their normal schedule.</p>,
        },
        {
          id: 'stuck', title: 'Can’t sign in?',
          body: <p>{config.supportEmail ? <>Email <a className={link} href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> from the address on the account and ask for it to be deleted.</> : 'Contact the person who invited you and ask for the account to be deleted.'} We’ll confirm it’s you before we delete anything.</p>,
        },
      ]}
    />
  )
}
