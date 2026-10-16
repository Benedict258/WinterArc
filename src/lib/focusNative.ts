import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from './native'

// On the phone the timer can't tick while the app is closed, so the end of a round is
// scheduled with the system. Pausing or resetting cancels it.
const ID = 910001

export async function scheduleTimerEnd(at: number, title: string, body: string) {
  if (!isNative()) return
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') return
    await LocalNotifications.cancel({ notifications: [{ id: ID }] })
    await LocalNotifications.schedule({ notifications: [{ id: ID, title, body, schedule: { at: new Date(at), allowWhileIdle: true } }] })
  } catch { /* the in-app alert still works */ }
}

export async function cancelTimerEnd() {
  if (!isNative()) return
  try { await LocalNotifications.cancel({ notifications: [{ id: ID }] }) } catch { /* nothing scheduled */ }
}
