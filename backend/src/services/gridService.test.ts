import { generateWeek, getWeek, regenerateWeek } from './gridService'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { addDays } from 'date-fns'

// Mock the Thread and Task models
jest.mock('../models/Thread')
jest.mock('../models/Task')

describe('gridService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('generateWeek', () => {
    it('should generate tasks for fixed-day threads', async () => {
      // Mock threads data
      const mockThreads = [
        {
          _id: 'thread1',
          name: 'Fixed Day Thread',
          frequency: 'fixed-day',
          fixedDay: 1, // Tuesday
          status: 'active',
        },
        {
          _id: 'thread2',
          name: 'Inactive Thread',
          frequency: 'fixed-day',
          fixedDay: 2, // Wednesday
          status: 'archived', // Should be filtered out
        }
      ]

      // Mock existing tasks (empty for this test)
      const mockExistingTasks = []

      // Mock start date (Monday, Jan 1, 2024)
      const startDate = new Date(2024, 0, 1) // 2024-01-01

      // Call generateWeek
      const result = await generateWeek(startDate, mockThreads, mockExistingTasks)

      // Assertions
      expect(result).toHaveLength(1) // Only one active fixed-day thread
      expect(result[0]).toMatchObject({
        title: 'Fixed Day Thread',
        threadId: 'thread1',
        date: expect.any(Date),
        timeBlock: 'morning',
        source: 'auto-generated',
        status: 'pending'
      })

      // Check that the date is correct (Tuesday, Jan 2, 2024)
      expect(result[0].date).toEqual(addDays(startDate, 1))
    })

    it('should generate tasks for daily threads', async () => {
      // Mock threads data
      const mockThreads = [
        {
          _id: 'thread1',
          name: 'Daily Thread',
          frequency: 'daily',
          status: 'active',
        }
      ]

      // Mock existing tasks (empty for this test)
      const mockExistingTasks = []

      // Mock start date (Monday, Jan 1, 2024)
      const startDate = new Date(2024, 0, 1) // 2024-01-01

      // Call generateWeek
      const result = await generateWeek(startDate, mockThreads, mockExistingTasks)

      // Assertions
      expect(result).toHaveLength(7) // One task per day for 7 days
      result.forEach((task, index) => {
        expect(task).toMatchObject({
          title: 'Daily Thread',
          threadId: 'thread1',
          date: expect.any(Date),
          timeBlock: index % 2 === 0 ? 'morning' : 'afternoon',
          source: 'auto-generated',
          status: 'pending'
        })
        expect(task.date).toEqual(addDays(startDate, index))
      })
    })

    it('should distribute weekly threads to least-loaded day', async () => {
      // Mock threads data
      const mockThreads = [
        {
          _id: 'thread1',
          name: 'Weekly Thread 1',
          frequency: 'weekly',
          status: 'active',
        },
        {
          _id: 'thread2',
          name: 'Weekly Thread 2',
          frequency: 'weekly',
          status: 'active',
        }
      ]

      // Mock existing tasks (some tasks to make days uneven)
      const mockExistingTasks = [
        {
          _id: 'task1',
          title: 'Existing Task',
          threadId: null,
          date: addDays(new Date(2024, 0, 1), 0), // Monday
          timeBlock: 'morning',
          status: 'pending',
          source: 'manual'
        }
      ]

      // Mock start date (Monday, Jan 1, 2024)
      const startDate = new Date(2024, 0, 1) // 2024-01-01

      // Call generateWeek
      const result = await generateWeek(startDate, mockThreads, mockExistingTasks)

      // Assertions
      expect(result).toHaveLength(2) // Two weekly threads
      // Both should be on different days (not Monday since it already has a task)
      const days = result.map(t => t.date.getDate())
      expect(days).toContain(2) // Tuesday
      expect(days).toContain(3) // Wednesday
      expect(days).not.toContain(1) // Monday (already has task)
    })

    it('should generate tasks for multiple threads', async () => {
      // Mock threads data
      const mockThreads = [
        {
          _id: 'thread1',
          name: 'Multiple Thread',
          frequency: 'multiple',
          status: 'active',
        }
      ]

      // Mock existing tasks (empty for this test)
      const mockExistingTasks = []

      // Mock start date (Monday, Jan 1, 2024)
      const startDate = new Date(2024, 0, 1) // 2024-01-01

      // Call generateWeek
      const result = await generateWeek(startDate, mockThreads, mockExistingTasks)

      // Assertions
      // With 1 multiple thread, slotsPerThread = ceil((3 * 1) / 7) = ceil(3/7) = 1
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        title: 'Multiple Thread',
        threadId: 'thread1',
        source: 'auto-generated',
        status: 'pending'
      })
      // Date should be within the week
      expect(result[0].date >= startDate && result[0].date < addDays(startDate, 7)).toBe(true)
    })
  })

  describe('getWeek', () => {
    it('should merge generated tasks with existing manual tasks', async () => {
      // Mock Thread.find
      const mockThreads = [
        {
          _id: 'thread1',
          name: 'Test Thread',
          frequency: 'daily',
          status: 'active',
        }
      ]
      ;(Thread.find as jest.Mock).mockResolvedValue(mockThreads)

      // Mock Task.find
      const mockExistingTasks = [
        {
          _id: 'task1',
          title: 'Manual Task',
          threadId: null,
          date: new Date(2024, 0, 1), // Monday
          timeBlock: 'morning',
          status: 'pending',
          source: 'manual'
        }
      ]
      ;(Task.find as jest.Mock).mockResolvedValue(mockExistingTasks)

      // Mock start date (Monday, Jan 1, 2024)
      const startDate = new Date(2024, 0, 1) // 2024-01-01

      // Call getWeek
      const result = await getWeek(startDate)

      // Assertions
      // Should have 7 generated daily tasks + 1 manual task = 8 tasks
      expect(result).toHaveLength(8)
      
      // Check that manual task is preserved
      const manualTask = result.find(t => t.source === 'manual')
      expect(manualTask).toBeDefined()
      expect(manualTask?.title).toBe('Manual Task')
      
      // Check that generated tasks are present
      const generatedTasks = result.filter(t => t.source === 'auto-generated')
      expect(generatedTasks).toHaveLength(7)
    })
  })

  describe('regenerateWeek', () => {
    it('should delete auto-generated tasks and regenerate them', async () => {
      // Mock Thread.find
      const mockThreads = [
        {
          _id: 'thread1',
          name: 'Test Thread',
          frequency: 'daily',
          status: 'active',
        }
      ]
      ;(Thread.find as jest.Mock).mockResolvedValue(mockThreads)

      // Mock Task.deleteMany
      ;(Task.deleteMany as jest.Mock).mockResolvedValue({})

      // Mock Task.insertMany
      const mockGeneratedTasks = [
        {
          _id: 'generated1',
          title: 'Generated Task',
          threadId: 'thread1',
          date: new Date(2024, 0, 1),
          timeBlock: 'morning',
          source: 'auto-generated',
          status: 'pending'
        }
      ]
      ;(Task.insertMany as jest.Mock).mockResolvedValue(mockGeneratedTasks)

      // Mock start date (Monday, Jan 1, 2024)
      const startDate = new Date(2024, 0, 1) // 2024-01-01

      // Call regenerateWeek
      const result = await regenerateWeek(startDate)

      // Assertions
      expect(Task.deleteMany).toHaveBeenCalledWith({
        date: { $gte: startDate, $lt: expect.any(Date) },
        source: 'auto-generated',
      })
      expect(Task.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Test Thread',
          threadId: 'thread1',
          source: 'auto-generated',
          status: 'pending'
        })
      ])
      expect(result).toEqual(mockGeneratedTasks)
    })
  })
})