// Sync queue for offline operations. Shares the IndexedDB connection with storage.ts.

import { openDB, QUEUE_STORE } from './storage'

export const initSyncDB = async (): Promise<void> => {
  await openDB()
}

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

export const addToQueue = async (operation: any) => {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  tx.objectStore(QUEUE_STORE).add({ ...operation, timestamp: Date.now() })
  await txDone(tx)
}

export const getQueue = async (): Promise<any[]> => {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      // Ordered by key (autoIncrement), i.e. the order operations were queued
      const request = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('Failed to get queue:', error)
    return []
  }
}

export const removeFromQueue = async (id: number) => {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  tx.objectStore(QUEUE_STORE).delete(id)
  await txDone(tx)
}

export const clearQueue = async () => {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  tx.objectStore(QUEUE_STORE).clear()
  await txDone(tx)
}

export const isOnline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine
}

type OperationHandler = (operation: any) => Promise<any>

import { API_URL } from './api'

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const send = async (url: string, init: RequestInit) => {
  const response = await fetch(url, { credentials: 'include', ...init })
  if (!response.ok) throw new HttpError(response.status, `${init.method} ${url}: ${response.status}`)
  return response
}

const operationHandlers: Record<string, OperationHandler> = {
  'create': async (operation: any) => {
    const response = await send(`${API_URL}${operation.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation.data),
    })
    return response.json()
  },
  'update': async (operation: any) => {
    const response = await send(`${API_URL}${operation.endpoint}/${operation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation.data),
    })
    return response.json()
  },
  'delete': async (operation: any) => {
    await send(`${API_URL}${operation.endpoint}/${operation.id}`, { method: 'DELETE' })
    return { success: true }
  },
}

let processing: Promise<void> | null = null

/**
 * Replays queued operations in order. Only one run at a time — the online
 * event and the app's listener both trigger this, and running twice would
 * replay creates twice.
 */
export const processQueue = (): Promise<void> => {
  if (processing) return processing
  processing = (async () => {
    if (!isOnline()) return
    const queue = await getQueue()
    for (const operation of queue) {
      const handler = operationHandlers[operation.type]
      if (!handler) {
        console.error(`Unknown operation type: ${operation.type}`)
        await removeFromQueue(operation.id)
        continue
      }
      try {
        await handler(operation)
        await removeFromQueue(operation.id)
      } catch (error) {
        // A 4xx will never succeed on retry (e.g. it was edited offline before
        // its create synced); drop it. Network errors and 5xx stay queued.
        if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
          console.error(`Dropping operation ${operation.id}:`, error.message)
          await removeFromQueue(operation.id)
          continue
        }
        console.error(`Failed to process operation ${operation.id}, will retry:`, error)
        // Keep order: stop here so later ops don't run before this one
        break
      }
    }
  })().finally(() => { processing = null })
  return processing
}

// Event listeners for online/offline
let onlineListener: (() => void) | null = null
let offlineListener: (() => void) | null = null

export const startSyncListener = (onOnline: () => void, onOffline: () => void) => {
  if (typeof window === 'undefined') return
  stopSyncListener()

  onlineListener = () => {
    onOnline()
    processQueue().catch(console.error)
  }
  offlineListener = () => {
    onOffline()
  }

  window.addEventListener('online', onlineListener)
  window.addEventListener('offline', offlineListener)

  // Flush anything left over from a previous session
  processQueue().catch(console.error)
}

export const stopSyncListener = () => {
  if (typeof window === 'undefined') return
  if (onlineListener) {
    window.removeEventListener('online', onlineListener)
    onlineListener = null
  }
  if (offlineListener) {
    window.removeEventListener('offline', offlineListener)
    offlineListener = null
  }
}
