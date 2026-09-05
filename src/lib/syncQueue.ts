// Sync queue for offline operations

const DB_NAME = 'workspace-db'
const DB_VERSION = 1
const QUEUE_STORE = 'sync-queue'

let db: IDBDatabase | null = null
const onlineListeners: (() => void)[] = []

export const initSyncDB = (): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve()
    }

    request.onupgradeneeded = () => {
      const dbInstance = request.result
      db = dbInstance
      if (!dbInstance.objectStoreNames.contains(QUEUE_STORE)) {
        const store = dbInstance.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

const getQueueStore = (mode: IDBTransactionMode = 'readonly') => {
  if (!db) {
    throw new Error('Database not initialized')
  }
  const transaction = db.transaction(QUEUE_STORE, mode)
  return {
    store: transaction.objectStore(QUEUE_STORE),
    done: () => new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
}

export const addToQueue = async (operation: any) => {
  const store = getQueueStore('readwrite')
  try {
    const operationWithTimestamp = {
      ...operation,
      timestamp: Date.now(),
    }
    await store.store.add(operationWithTimestamp)
    await store.done()
  } catch (error) {
    console.error('Failed to add operation to queue:', error)
    throw error
  }
}

export const getQueue = async (): Promise<any[]> => {
  const store = getQueueStore()
  try {
    const operations: any[] = []
    await new Promise<void>((resolve, reject) => {
      const request = store.store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          operations.push(cursor.value)
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })
    return operations
  } catch (error) {
    console.error('Failed to get queue:', error)
    return []
  }
}

export const removeFromQueue = async (id: number) => {
  const store = getQueueStore('readwrite')
  try {
    await store.store.delete(id)
    await store.done()
  } catch (error) {
    console.error('Failed to remove operation from queue:', error)
    throw error
  }
}

export const clearQueue = async () => {
  const store = getQueueStore('readwrite')
  try {
    await store.store.clear()
    await store.done()
  } catch (error) {
    console.error('Failed to clear queue:', error)
    throw error
  }
}

export const isOnline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine
}

type OperationHandler = (operation: any) => Promise<any>

const API_URL = import.meta.env.VITE_API_URL || '';

const operationHandlers: Record<string, OperationHandler> = {
  'create': async (operation: any) => {
    const response = await fetch(`${API_URL}${operation.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(operation.data),
    })
    if (!response.ok) {
      throw new Error(`Failed to create: ${response.statusText}`)
    }
    return response.json()
  },
  'update': async (operation: any) => {
    const response = await fetch(`${API_URL}${operation.endpoint}/${operation.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(operation.data),
    })
    if (!response.ok) {
      throw new Error(`Failed to update: ${response.statusText}`)
    }
    return response.json()
  },
  'delete': async (operation: any) => {
    const response = await fetch(`${API_URL}${operation.endpoint}/${operation.id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete: ${response.statusText}`)
    }
    return { success: true }
  }
}

export const processQueue = async () => {
  if (!isOnline()) {
    console.warn('Cannot process queue: offline')
    return
  }

  const queue = await getQueue()
  for (const operation of queue) {
    try {
      const handler = operationHandlers[operation.type]
      if (!handler) {
        console.error(`Unknown operation type: ${operation.type}`)
        await removeFromQueue(operation.id)
        continue
      }

      await handler(operation)
      await removeFromQueue(operation.id)
      console.log(`Processed operation: ${operation.type}`)
    } catch (error) {
      console.error(`Failed to process operation ${operation.id}:`, error)
      // Keep the operation in the queue for retry
    }
  }
}

// Event listeners for online/offline
let onlineListener: (() => void) | null = null
let offlineListener: (() => void) | null = null

export const startSyncListener = (onOnline: () => void, onOffline: () => void) => {
  if (typeof navigator === 'undefined') return

  onlineListener = () => {
    onOnline()
    processQueue().catch(console.error)
  }
  offlineListener = () => {
    onOffline()
  }

  window.addEventListener('online', onlineListener)
  window.addEventListener('offline', offlineListener)
}

export const stopSyncListener = () => {
  if (typeof navigator === 'undefined') return
  if (onlineListener) {
    window.removeEventListener('online', onlineListener)
    onlineListener = null
  }
  if (offlineListener) {
    window.removeEventListener('offline', offlineListener)
    offlineListener = null
  }
}