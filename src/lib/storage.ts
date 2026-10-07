// IndexedDB storage layer for offline support.
// One database, one connection, shared with the sync queue (syncQueue.ts).

const DB_NAME = 'workspace-db'
// v2: every store is created in one place. v1 was opened by two modules with
// different stores, so whichever ran second never got its stores.
const DB_VERSION = 2
const DATA_STORES = ['threads', 'tasks', 'goals'] as const
export const QUEUE_STORE = 'sync-queue'

type DataStore = typeof DATA_STORES[number]

let dbPromise: Promise<IDBDatabase> | null = null

export const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of DATA_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
  return dbPromise
}

export const initDB = async (): Promise<void> => {
  await openDB()
}

/** Test helper: forget the cached connection. */
export const resetDBConnection = () => {
  dbPromise?.then(db => db.close()).catch(() => {})
  dbPromise = null
}

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const normalize = (record: any) => ({ ...record, id: record.id || record._id, _id: record._id || record.id })

const readAll = async (storeName: string): Promise<any[]> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Replace the whole store with `records`. */
const replaceAll = async (storeName: DataStore, records: any[]) => {
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  store.clear()
  for (const r of records) store.put(normalize(r))
  await txDone(tx)
}

/** Insert or update `records`, leaving everything else in place. */
const upsert = async (storeName: DataStore, records: any[]) => {
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  for (const r of records) store.put(normalize(r))
  await txDone(tx)
}

const remove = async (storeName: DataStore, id: string) => {
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(id)
  await txDone(tx)
}

const safe = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    console.error(`${label}:`, error)
    return fallback
  }
}

// Threads are always fetched as a full list, so the cache mirrors it exactly.
export const cacheThreads = (threads: any[]) => safe('Failed to cache threads', undefined, () => replaceAll('threads', threads))
export const upsertCachedThreads = (threads: any[]) => safe('Failed to cache threads', undefined, () => upsert('threads', threads))
export const removeCachedThread = (id: string) => safe('Failed to remove cached thread', undefined, () => remove('threads', id))
export const getCachedThreads = () => safe('Failed to get cached threads', [] as any[], () => readAll('threads'))

// Tasks are fetched with filters, so a response only covers part of the cache.
export const cacheTasks = (tasks: any[]) => safe('Failed to cache tasks', undefined, () => upsert('tasks', tasks))
export const removeCachedTask = (id: string) => safe('Failed to remove cached task', undefined, () => remove('tasks', id))
export const getCachedTasks = () => safe('Failed to get cached tasks', [] as any[], () => readAll('tasks'))

export const cacheGoals = (goals: any[]) => safe('Failed to cache goals', undefined, () => replaceAll('goals', goals))
export const getCachedGoals = () => safe('Failed to get cached goals', [] as any[], () => readAll('goals'))

export const clearCache = () =>
  safe('Failed to clear cache', undefined, async () => {
    const db = await openDB()
    const tx = db.transaction([...DATA_STORES], 'readwrite')
    for (const name of DATA_STORES) tx.objectStore(name).clear()
    await txDone(tx)
  })
