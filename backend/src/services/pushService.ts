import webpush from 'web-push'
import { PushSubscription } from '../models/PushSubscription'

let configured = false

/** VAPID keys come from the environment (`npm run push:keys` prints a pair). */
export function pushConfigured() {
  if (configured) return true
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
  return true
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null

export type Payload = { title: string; body: string; url: string; tag?: string }

/** Tests replace the sender so nothing leaves the process. */
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string) => Promise<unknown>
let sender: Sender = (sub, body) => webpush.sendNotification(sub, body)
export const setPushSender = (fn: Sender | null) => { sender = fn ?? ((sub, body) => webpush.sendNotification(sub, body)) }

/** Send to every device this user registered; drop subscriptions the push service says are gone. */
export async function sendToUser(userId: string, payload: Payload): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 }
  const subs = await PushSubscription.find({ userId })
  let sent = 0
  let removed = 0
  await Promise.all(subs.map(async sub => {
    try {
      await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } }, JSON.stringify(payload))
      sent++
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id, userId })
        removed++
      } else {
        console.error('Push failed:', error?.statusCode ?? error?.message)
      }
    }
  }))
  return { sent, removed }
}
