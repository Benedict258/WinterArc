import { isOnline } from './syncQueue'

/** 24-hex id the server accepts as a Mongo ObjectId, so offline-created records keep their id when synced. */
export const newId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** fetch() rejects with a TypeError when the network is unreachable (HTTP errors don't reject). */
export const isNetworkError = (error: unknown) => error instanceof TypeError

/**
 * Run `online`; if the device is offline, or the request fails on the network
 * (navigator.onLine is true on Wi-Fi without internet), run `offline` instead,
 * which should queue the change locally.
 */
export async function onlineOrQueue<T>(online: () => Promise<T>, offline: () => Promise<T>): Promise<T> {
  if (isOnline()) {
    try {
      return await online()
    } catch (error) {
      if (!isNetworkError(error)) throw error
    }
  }
  return offline()
}
