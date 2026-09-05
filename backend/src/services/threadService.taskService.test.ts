import { getThreads, createThread, updateThread, deleteThread } from './threadService'
import { getTasks, createTask, updateTask, deleteTask, completeTask } from './taskService'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'

// Mock the models
jest.mock('../models/Thread')
jest.mock('../models/Task')

describe('threadService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getThreads', () => {
    it('should return threads that are not archived', async () => {
      // Mock data
      const mockThreads = [
        { _id: '1', name: 'Active Thread', status: 'active' },
        { _id: '2', name: 'Parked Thread', status: 'parked' },
        { _id: '3', name: 'Archived Thread', status: 'archived' }
      ]
      
      // Mock Thread.find
      ;(Thread.find as jest.Mock).mockResolvedValue(mockThreads)
      
      // Call getThreads
      const result = await getThreads()
      
      // Assertions
      expect(Thread.find).toHaveBeenCalledWith({ status: { $ne: 'archived' } })
      expect(result).toEqual([
        { _id: '1', name: 'Active Thread', status: 'active' },
        { _id: '2', name: 'Parked Thread', status: 'parked' }
      ])
    })
  })

  describe('createThread', () => {
    it('should create and save a new thread', async () => {
      // Mock data
      const mockThreadData = { name: 'New Thread', frequency: 'daily', status: 'active' }
      const mockThreadInstance = {
        ...mockThreadData,
        _id: 'new-thread-id',
        save: jest.fn().mockResolvedValue({ ...mockThreadData, _id: 'new-thread-id' })
      }
      
      // Mock Thread constructor
      ;(Thread as jest.Mock).mockImplementation(() => mockThreadInstance)
      
      // Call createThread
      const result = await createThread(mockThreadData)
      
      // Assertions
      expect(Thread).toHaveBeenCalledWith(mockThreadData)
      expect(mockThreadInstance.save).toHaveBeenCalled()
      expect(result).toEqual({ ...mockThreadData, _id: 'new-thread-id' })
    })
  })

  describe('updateThread', () => {
    it('should update a thread and return the updated document', async () => {
      // Mock data
      const mockId = 'thread-id'
      const mockUpdateData = { name: 'Updated Thread', status: 'parked' }
      const mockUpdatedThread = { _id: mockId, ...mockUpdateData }
      
      // Mock Thread.findByIdAndUpdate
      ;(Thread.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedThread)
      
      // Call updateThread
      const result = await updateThread(mockId, mockUpdateData)
      
      // Assertions
      expect(Thread.findByIdAndUpdate).toHaveBeenCalledWith(mockId, mockUpdateData, { new: true })
      expect(result).toEqual(mockUpdatedThread)
    })
  })

  describe('deleteThread', () => {
    it('should archive a thread (soft delete)', async () => {
      // Mock data
      const mockId = 'thread-id'
      const mockArchivedThread = { _id: mockId, status: 'archived' }
      
      // Mock Thread.findByIdAndUpdate
      ;(Thread.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockArchivedThread)
      
      // Call deleteThread
      const result = await deleteThread(mockId)
      
      // Assertions
      expect(Thread.findByIdAndUpdate).toHaveBeenCalledWith(mockId, { status: 'archived' }, { new: true })
      expect(result).toEqual(mockArchivedThread)
    })
  })
})

describe('taskService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getTasks', () => {
    it('should return tasks filtered by date', async () => {
      // Mock data
      const mockDate = '2024-01-15'
      const mockTasks = [
        { _id: '1', title: 'Task 1', date: new Date(2024, 0, 15) },
        { _id: '2', title: 'Task 2', date: new Date(2024, 0, 16) }
      ]
      
      // Mock Task.find
      ;(Task.find as jest.Mock).mockResolvedValue(mockTasks)
      
      // Call getTasks
      const result = await getTasks({ date: mockDate })
      
      // Assertions
      expect(Task.find).toHaveBeenCalledWith({
        date: { $gte: new Date(2024, 0, 15), $lt: new Date(2024, 0, 16) }
      })
      expect(result).toEqual(mockTasks)
    })
    
    it('should return tasks filtered by status', async () => {
      // Mock data
      const mockTasks = [
        { _id: '1', title: 'Task 1', status: 'pending' },
        { _id: '2', title: 'Task 2', status: 'done' }
      ]
      
      // Mock Task.find
      ;(Task.find as jest.Mock).mockResolvedValue(mockTasks)
      
      // Call getTasks
      const result = await getTasks({ status: 'done' })
      
      // Assertions
      expect(Task.find).toHaveBeenCalledWith({ status: 'done' })
      expect(result).toEqual([{ _id: '2', title: 'Task 2', status: 'done' }])
    })
    
    it('should return tasks filtered by threadId', async () => {
      // Mock data
      const mockTasks = [
        { _id: '1', title: 'Task 1', threadId: 'thread1' },
        { _id: '2', title: 'Task 2', threadId: 'thread2' }
      ]
      
      // Mock Task.find
      ;(Task.find as jest.Mock).mockResolvedValue(mockTasks)
      
      // Call getTasks
      const result = await getTasks({ threadId: 'thread1' })
      
      // Assertions
      expect(Task.find).toHaveBeenCalledWith({ threadId: 'thread1' })
      expect(result).toEqual([{ _id: '1', title: 'Task 1', threadId: 'thread1' }])
    })
    
    it('should sort tasks by date and createdAt', async () => {
      // Mock data
      const mockTasks = [
        { _id: '1', title: 'Task 1', date: new Date(2024, 0, 16), createdAt: new Date(2024, 0, 15) },
        { _id: '2', title: 'Task 2', date: new Date(2024, 0, 15), createdAt: new Date(2024, 0, 16) }
      ]
      
      // Mock Task.find
      ;(Task.find as jest.Mock).mockResolvedValue(mockTasks)
      
      // Call getTasks
      const result = await getTasks({})
      
      // Assertions
      expect(Task.find).toHaveBeenCalledWith({}, { sort: { date: 1, createdAt: 1 } })
      // Should be sorted by date first, then createdAt
      expect(result).toEqual([
        { _id: '2', title: 'Task 2', date: new Date(2024, 0, 15), createdAt: new Date(2024, 0, 16) },
        { _id: '1', title: 'Task 1', date: new Date(2024, 0, 16), createdAt: new Date(2024, 0, 15) }
      ])
    })
  })

  describe('createTask', () => {
    it('should create and save a new task', async () => {
      // Mock data
      const mockTaskData = { title: 'New Task', status: 'pending' }
      const mockTaskInstance = {
        ...mockTaskData,
        _id: 'new-task-id',
        save: jest.fn().mockResolvedValue({ ...mockTaskData, _id: 'new-task-id' })
      }
      
      // Mock Task constructor
      ;(Task as jest.Mock).mockImplementation(() => mockTaskInstance)
      
      // Call createTask
      const result = await createTask(mockTaskData)
      
      // Assertions
      expect(Task).toHaveBeenCalledWith(mockTaskData)
      expect(mockTaskInstance.save).toHaveBeenCalled()
      expect(result).toEqual({ ...mockTaskData, _id: 'new-task-id' })
    })
  })

  describe('updateTask', () => {
    it('should set completedAt when status is changed to done', async () => {
      // Mock data
      const mockId = 'task-id'
      const mockUpdateData = { title: 'Updated Task', status: 'done' }
      const mockUpdatedTask = { _id: mockId, ...mockUpdateData, completedAt: new Date() }
      
      // Mock Task.findByIdAndUpdate
      ;(Task.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedTask)
      
      // Call updateTask
      const result = await updateTask(mockId, mockUpdateData)
      
      // Assertions
      expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(mockId, {
        title: 'Updated Task',
        status: 'done',
        completedAt: expect.any(Date)
      }, { new: true })
      expect(result).toEqual(mockUpdatedTask)
    })
    
    it('should not override existing completedAt when status is done', async () => {
      // Mock data
      const mockId = 'task-id'
      const mockExistingCompletedAt = new Date('2024-01-01')
      const mockUpdateData = { title: 'Updated Task', status: 'done', completedAt: mockExistingCompletedAt }
      const mockUpdatedTask = { _id: mockId, ...mockUpdateData }
      
      // Mock Task.findByIdAndUpdate
      ;(Task.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedTask)
      
      // Call updateTask
      const result = await updateTask(mockId, mockUpdateData)
      
      // Assertions
      expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(mockId, mockUpdateData, { new: true })
      expect(result).toEqual(mockUpdatedTask)
      expect(result.completedAt).toEqual(mockExistingCompletedAt)
    })
  })

  describe('deleteTask', () => {
    it('should delete a task by ID', async () => {
      // Mock data
      const mockId = 'task-id'
      const mockResult = { _id: mockId, title: 'Deleted Task' }
      
      // Mock Task.findByIdAndDelete
      ;(Task.findByIdAndDelete as jest.Mock).mockResolvedValue(mockResult)
      
      // Call deleteTask
      const result = await deleteTask(mockId)
      
      // Assertions
      expect(Task.findByIdAndDelete).toHaveBeenCalledWith(mockId)
      expect(result).toEqual(mockResult)
    })
  })

  describe('completeTask', () => {
    it('should mark a task as completed', async () => {
      // Mock data
      const mockId = 'task-id'
      const mockCompletedTask = { _id: mockId, status: 'done', completedAt: new Date() }
      
      // Mock Task.findByIdAndUpdate
      ;(Task.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockCompletedTask)
      
      // Call completeTask
      const result = await completeTask(mockId)
      
      // Assertions
      expect(Task.findByIdAndUpdate).toHaveBeenCalledWith(
        mockId,
        { status: 'done', completedAt: expect.any(Date) },
        { new: true }
      )
      expect(result).toEqual(mockCompletedTask)
    })
  })
})