import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { DEFAULT_NOTIFICATIONS, type NotificationSettings } from '@/shared/notificationPlan'
import { useAuth } from '@/context/AuthContext'
import { isNative } from '@/lib/native'
import { nativeNotificationsGranted, requestNativeNotifications, scheduleReminders } from '@/lib/nativeReminders'
import { getPushState, enablePush, disablePush, sendTestPush, type PushState } from '@/lib/push'

export default function NotificationsCard() {
  const { toast } = useToast()
  const { data: settings } = useSettings()
  const { user } = useAuth()
  const { mutate: updateSettings } = useUpdateSettings()
  const [state, setState] = useState<PushState>('off')
  const [busy, setBusy] = useState(false)

  const native = isNative()
  useEffect(() => {
    const load = native
      ? nativeNotificationsGranted().then((granted): PushState => (granted ? 'on' : 'off'))
      : getPushState()
    load.then(setState).catch(() => setState('unsupported'))
  }, [native])

  // The phone schedules its own reminders, so re-plan whenever the preferences change
  useEffect(() => { if (native && state === 'on') scheduleReminders().catch(() => {}) }, [native, state, settings?.notifications])

  const prefs: NotificationSettings = {
    dailyPlan: { ...DEFAULT_NOTIFICATIONS.dailyPlan, ...settings?.notifications?.dailyPlan },
    dueTasks: { ...DEFAULT_NOTIFICATIONS.dueTasks, ...settings?.notifications?.dueTasks },
    eventReminders: { ...DEFAULT_NOTIFICATIONS.eventReminders, ...settings?.notifications?.eventReminders },
    emailDigest: { ...DEFAULT_NOTIFICATIONS.emailDigest, ...settings?.notifications?.emailDigest },
  }
  const save = (next: NotificationSettings) => updateSettings({ notifications: next })

  const run = async (fn: () => Promise<PushState | void>, done?: string) => {
    setBusy(true)
    try {
      const result = await fn()
      if (result) setState(result)
      if (done) toast({ title: done })
    } catch (error) {
      toast({ title: 'Notifications', description: error instanceof Error ? error.message : 'Something went wrong', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell size={20} className="text-primary" /> Notifications</CardTitle>
        <CardDescription>Daily plan, due tasks and event reminders on this device, plus an optional daily email</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm">
            {state === 'unsupported' && 'This browser can’t receive push notifications.'}
            {state === 'denied' && 'Notifications are blocked. Allow them in your system settings, then come back.'}
            {state === 'off' && 'Notifications are off on this device.'}
            {state === 'on' && 'Notifications are on for this device.'}
          </p>
          <div className="flex gap-2 shrink-0">
            {state === 'off' && <Button size="sm" disabled={busy} onClick={() => run(native ? async () => ((await requestNativeNotifications()) ? 'on' : 'denied') : enablePush, 'Notifications enabled')}>Enable</Button>}
            {state === 'on' && (
              <>
                {!native && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await sendTestPush() }, 'Test sent')}>Send test</Button>}
                {!native && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(disablePush)}>Turn off</Button>}
              </>
            )}
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>Morning plan</span>
            <span className="flex items-center gap-2">
              <input type="time" value={prefs.dailyPlan.time} disabled={!prefs.dailyPlan.enabled}
                onChange={e => e.target.value && save({ ...prefs, dailyPlan: { ...prefs.dailyPlan, time: e.target.value } })}
                className="px-2 py-1 border rounded-md bg-background" />
              <input type="checkbox" checked={prefs.dailyPlan.enabled} className="accent-primary"
                onChange={e => save({ ...prefs, dailyPlan: { ...prefs.dailyPlan, enabled: e.target.checked } })} />
            </span>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Include due &amp; overdue tasks</span>
            <input type="checkbox" checked={prefs.dueTasks.enabled} className="accent-primary"
              onChange={e => save({ ...prefs, dueTasks: { enabled: e.target.checked } })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Event reminders</span>
            <span className="flex items-center gap-2">
              <select value={prefs.eventReminders.minutesBefore} disabled={!prefs.eventReminders.enabled}
                onChange={e => save({ ...prefs, eventReminders: { ...prefs.eventReminders, minutesBefore: Number(e.target.value) } })}
                className="px-2 py-1 border rounded-md bg-background">
                {[5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m} min before</option>)}
              </select>
              <input type="checkbox" checked={prefs.eventReminders.enabled} className="accent-primary"
                onChange={e => save({ ...prefs, eventReminders: { ...prefs.eventReminders, enabled: e.target.checked } })} />
            </span>
          </label>
        </div>

        <div className="space-y-2 border-t border-border pt-4 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>
              Daily email summary
              <span className="block text-xs text-muted-foreground">
                {user?.emailVerified ? `Sent to ${user.email}. Every email has a stop link.` : 'Confirm your email address first (see the banner at the top).'}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input type="time" value={prefs.emailDigest.time} disabled={!prefs.emailDigest.enabled || !user?.emailVerified}
                onChange={e => e.target.value && save({ ...prefs, emailDigest: { ...prefs.emailDigest, time: e.target.value } })}
                className="px-2 py-1 border rounded-md bg-background" />
              <input type="checkbox" aria-label="Daily email summary" checked={prefs.emailDigest.enabled} disabled={!user?.emailVerified} className="accent-primary"
                onChange={e => save({ ...prefs, emailDigest: { ...prefs.emailDigest, enabled: e.target.checked } })} />
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
