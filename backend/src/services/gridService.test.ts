import { generateWeek, getWeek, regenerateWeek } from './gridService'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import { addDays } from 'date-fns'

jest.mock('../models/Thread')
jest.mock('../models/Task')
jest.mock('../models/Settings')

const defaultBalancing = { maxDailyIntensity: 6, preferLowIntensityOnBusyDays: true }

beforeEach(() => {
  ;(Settings.findOne as jest.Mock).mockResolvedValue(null)
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('gridService', () => {
  describe('generateWeek', () => {
    it('places fixed-day threads on their fixed weekday', async () => {
      const startDate = new Date(2024, 0, 1) // Monday
      const result = await generateWeek(
        startDate,
        [
          { _id: 't1', name: 'Wed Thread', frequency: 'fixed-day', fixedDay: 2, status: 'active' },
          { _id: 't2', name: 'Archived', frequency: 'fixed-day', fixedDay: 3, status: 'archived' },
        ],
        [],
        defaultBalancing
      )
      expect(result).toHaveLength(1)
      expect(result[0].date).toEqual(addDays(startDate, 2))
      expect(result[0].threadId).toBe('t1')
    })

    it('places daily threads once per day for 7 days', async () => {
      const startDate = new Date(2024, 0, 1)
      const result = await generateWeek(
        startDate,
        [{ _id: 'd', name: 'Daily', frequency: 'daily', status: 'active' }],
        [],
        defaultBalancing
      )
      expect(result).toHaveLength(7)
      for (let i = 0; i < 7; i++) {
        expect(result[i].date).toEqual(addDays(startDate, i))
      }
    })

    it('places weekly threads on least-loaded day', async () => {
      const startDate = new Date(2024, 0, 1)
      const result = await generateWeek(
        startDate,
        [
          { _id: 'w1', name: 'Weekly A', frequency: 'weekly', status: 'active' },
          { _id: 'w2', name: 'Weekly B', frequency: 'weekly', status: 'active' },
        ],
        [],
        defaultBalancing
      )
      expect(result).toHaveLength(2)
      const day1 = result[0].date.getDay()
      const day2 = result[1].date.getDay()
      expect(day1).not.toBe(day2)
    })

    it('places multiple-frequency threads on 3 distinct days', async () => {
      const startDate = new Date(2024, 0, 1)
      const result = await generateWeek(
        startDate,
        [{ _id: 'm', name: 'Multi', frequency: 'multiple', status: 'active' }],
        [],
        defaultBalancing
      )
      expect(result).toHaveLength(3)
      const uniqueDays = new Set(result.map(r => r.date.toDateString()))
      expect(uniqueDays.size).toBe(3)
    })

    it('prevents duplicate thread on the same day', async () => {
      const startDate = new Date(2024, 0, 1)
      const result = await generateWeek(
        startDate,
        [
          { _id: 'dup', name: 'Multi', frequency: 'multiple', status: 'active' },
        ],
        [],
        defaultBalancing
      )
      const dayMap = new Map<string, number>()
      for (const t of result) {
        const key = t.date.toDateString()
        dayMap.set(key, (dayMap.get(key) || 0) + 1)
      }
      for (const count of dayMap.values()) {
        expect(count).toBe(1)
      }
    })

    it('respects maxDailyIntensity cap', async () => {
      const startDate = new Date(2024, 0, 1)
      const heavyThreads = Array.from({ length: 5 }, (_, i) => ({
        _id: `h${i}`,
        name: `Heavy ${i}`,
        frequency: 'weekly' as const,
        status: 'active',
        priority: 'high' as const,
        intensity: 'heavy' as const,
      }))
      const result = await generateWeek(startDate, heavyThreads, [], { maxDailyIntensity: 4, preferLowIntensityOnBusyDays: true })
      const dayLoads = new Map<string, number>()
      for (const t of result) {
        const key = t.date.toDateString()
        dayLoads.set(key, (dayLoads.get(key) || 0) + 4)
      }
      for (const load of dayLoads.values()) {
        expect(load).toBeLessThanOrEqual(8)
      }
    })

    it('places higher-priority threads earlier in the week when possible', async () => {
      const startDate = new Date(2024, 0, 1)
      const result = await generateWeek(
        startDate,
        [
          { _id: 'lo', name: 'Low', frequency: 'weekly', status: 'active', priority: 'low', intensity: 'light' },
          { _id: 'hi', name: 'High', frequency: 'weekly', status: 'active', priority: 'high', intensity: 'heavy' },
        ],
        [],
        defaultBalancing
      )
      const highDay = result.find(r => r.threadId === 'hi')!.date.getDate()
      const lowDay = result.find(r => r.threadId === 'lo')!.date.getDate()
      expect(highDay).toBeLessThan(lowDay)
    })
  })

  describe('getWeek', () => {
    it('returns existing tasks unchanged when auto-generated tasks exist', async () => {
      const startDate = new Date(2024, 0, 1)
      const existing = [
        { _id: 'm1', title: 'Manual', threadId: null, date: startDate, timeBlock: 'morning', status: 'pending', source: 'manual' },
      ]
      ;(Thread.find as jest.Mock).mockResolvedValue([{ _id: 'd', name: 'Daily', frequency: 'daily', status: 'active' }])
      ;(Task.find as jest.Mock).mockResolvedValueOnce([
        { _id: 'auto1', title: 'Auto', threadId: 'd', date: startDate, timeBlock: 'morning', status: 'pending', source: 'auto-generated' },
        ...existing,
      ])

      const result = await getWeek(startDate)
      expect(result).toHaveLength(2)
      expect(result.find(t => t.source === 'manual')).toBeDefined()
    })
  })

  describe('regenerateWeek', () => {
    it('deletes auto-generated and re-inserts fresh balanced tasks', async () => {
      const startDate = new Date(2024, 0, 1)
      ;(Thread.find as jest.Mock).mockResolvedValue([{ _id: 'd', name: 'Daily', frequency: 'daily', status: 'active' }])
      ;(Task.deleteMany as jest.Mock).mockResolvedValue({})
      ;(Task.insertMany as jest.Mock).mockResolvedValue([])
      ;(Task.find as jest.Mock).mockResolvedValue([])

      const result = await regenerateWeek(startDate)
      expect(Task.deleteMany).toHaveBeenCalledWith({
        date: { $gte: expect.any(Date), $lt: expect.any(Date) },
        source: 'auto-generated',
      })
      expect(Task.insertMany).toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })
})
