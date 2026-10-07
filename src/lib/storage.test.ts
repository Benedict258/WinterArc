import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  resetDBConnection,
  cacheTasks,
  getCachedTasks,
  removeCachedTask,
  cacheThreads,
  upsertCachedThreads,
  getCachedThreads,
  cacheGoals,
  getCachedGoals,
  clearCache,
} from './storage'
import { addToQueue, getQueue, processQueue } from './syncQueue'

beforeEach(() => {
  // Fresh in-memory IndexedDB per test
  globalThis.indexedDB = new IDBFactory()
  resetDBConnection()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('storage', () => {
  it('caching a filtered task list does not wipe other cached tasks', async () => {
    await cacheTasks([{ _id: 'a', title: 'A' }, { _id: 'b', title: 'B' }])
    await cacheTasks([{ _id: 'b', title: 'B2' }])
    const tasks = await getCachedTasks()
    expect(tasks.map(t => [t._id, t.title]).sort()).toEqual([['a', 'A'], ['b', 'B2']])
  })

  it('removes a single task', async () => {
    await cacheTasks([{ _id: 'a' }, { _id: 'b' }])
    await removeCachedTask('a')
    expect((await getCachedTasks()).map(t => t._id)).toEqual(['b'])
  })

  it('cacheThreads mirrors the full list; upsert keeps the rest', async () => {
    await cacheThreads([{ _id: 't1' }, { _id: 't2' }])
    await upsertCachedThreads([{ _id: 't3' }])
    expect((await getCachedThreads()).length).toBe(3)
    await cacheThreads([{ _id: 't1' }])
    expect((await getCachedThreads()).map(t => t._id)).toEqual(['t1'])
  })

  it('caches goals that only have _id', async () => {
    await cacheGoals([{ _id: 'g1', text: 'Goal' }])
    expect((await getCachedGoals())[0]).toMatchObject({ _id: 'g1', text: 'Goal' })
  })

  it('clearCache empties data stores', async () => {
    await cacheTasks([{ _id: 'a' }])
    await cacheThreads([{ _id: 't' }])
    await clearCache()
    expect(await getCachedTasks()).toEqual([])
    expect(await getCachedThreads()).toEqual([])
  })

  it('data stores and the sync queue live in the same database', async () => {
    await cacheTasks([{ _id: 'a' }])
    await addToQueue({ type: 'create', endpoint: '/api/tasks', data: { title: 'x' } })
    expect(await getCachedTasks()).toHaveLength(1)
    expect(await getQueue()).toHaveLength(1)
  })
})

describe('syncQueue', () => {
  it('replays each operation once even if triggered twice concurrently', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await addToQueue({ type: 'create', endpoint: '/api/tasks', data: { title: 'x' } })
    await Promise.all([processQueue(), processQueue()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await getQueue()).toEqual([])
  })

  it('keeps operations queued on network failure, in order', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const fetchMock = vi.fn(async () => { throw new TypeError('network') })
    vi.stubGlobal('fetch', fetchMock)

    await addToQueue({ type: 'create', endpoint: '/api/tasks', data: { title: '1' } })
    await addToQueue({ type: 'create', endpoint: '/api/tasks', data: { title: '2' } })
    await processQueue()

    // Stops at the first failure so later ops don't jump ahead
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await getQueue()).toHaveLength(2)
  })

  it('drops operations the server rejects with 4xx', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })))

    await addToQueue({ type: 'update', endpoint: '/api/tasks', id: 'temp-1', data: {} })
    await processQueue()
    expect(await getQueue()).toEqual([])
  })

  it('does nothing while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await addToQueue({ type: 'create', endpoint: '/api/tasks', data: {} })
    await processQueue()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await getQueue()).toHaveLength(1)
  })
})
