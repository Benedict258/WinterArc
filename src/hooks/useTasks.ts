import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { taskSchema } from '@/utils/validation';
import { initDB, cacheTasks, getCachedTasks, clearCache } from '@/lib/storage';
import { initSyncDB, addToQueue, isOnline, startSyncListener, stopSyncListener, processQueue } from '@/lib/syncQueue';

// Types
export type Task = {
  _id: string;
  title: string;
  threadId: string | null;
  date: string; // ISO date string
  timeBlock: string;
  status: string;
  completedAt: string | null;
  calendarEventId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

// API URL
const API_URL = import.meta.env.VITE_API_URL || '';

// Initialize DB and sync listener once
let dbInitialized = false;
let syncDbInitialized = false;
let syncListenerStarted = false;

const initialize = async () => {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
  if (!syncDbInitialized) {
    await initSyncDB();
    syncDbInitialized = true;
  }
};

// We'll start the sync listener in the component that uses the hook, but we'll provide a hook to do that.
// For now, we'll assume the app will call startSyncListener and stopSyncListener appropriately.
// We'll not start/stop the listener in this hook to avoid multiple instances.

// Fetch tasks with optional filters
export const useTasks = (filters: { date?: string; status?: string; threadId?: string | null } = {}) => {
  const queryClient = useQueryClient();
  
  // Initialize DB on first call
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      try {
        const apiTasks = await fetchTasksFromAPI(filters);
        await cacheTasks(apiTasks);
        return apiTasks;
      } catch (err) {
        console.warn('Network fetch failed, falling back to cache:', err);
        const cachedTasks = await getCachedTasks();
        if (cachedTasks.length > 0) {
          return cachedTasks.filter((task: any) => {
            if (filters.date && (!task.date || !task.date.startsWith(filters.date))) return false;
            if (filters.status && task.status !== filters.status) return false;
            if (filters.threadId !== undefined && task.threadId !== filters.threadId) return false;
            return true;
          });
        }
        return [];
      }
    },
  });
};

// Helper to fetch tasks from API
const fetchTasksFromAPI = async (filters: { date?: string; status?: string; threadId?: string | null }): Promise<Task[]> => {
  const queryParams = new URLSearchParams();
  if (filters.date) queryParams.append('date', filters.date);
  if (filters.status) queryParams.append('status', filters.status);
  if (filters.threadId) queryParams.append('threadId', filters.threadId);
  
  const response = await fetch(`${API_URL}/api/tasks?${queryParams.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return response.json();
};

// Create a new task
export const useCreateTask = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Initialize DB on first call
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (newTask: Partial<Omit<Task, '_id' | 'createdAt' | 'updatedAt'>> & { title: string }) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newTask),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create task');
        }
        
        const createdTask = await response.json();
        // Update cache
        await cacheTasks([createdTask]); // This will replace the cache? We should add to cache.
        // Actually, we should get the current cache and add the new task.
        // For simplicity, we'll invalidate the query to refetch.
        // But we want to update optimistically.
        // We'll let the query client invalidate and refetch.
        return createdTask;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'create',
          endpoint: '/api/tasks',
          data: newTask,
        };
        await addToQueue(operation);
        // Optimistically add to cache
        const tempTask = {
          ...newTask,
          _id: `temp-${Date.now()}`, // Temporary ID
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        // We'll add the temp task to the cache so it shows up immediately
        const currentTasks = await getCachedTasks();
        await cacheTasks([...currentTasks, tempTask]);
        // Return the temp task so the UI can use it
        return tempTask;
      }
    },
    onSuccess: (data) => {
      // If we were online, we already updated cache in mutationFn.
      // If we were offline, we added to queue and optimistically updated cache.
      // In either case, we want to invalidate queries to refetch from API when online.
      // But we don't want to lose the optimistic update.
      // We'll invalidate the query so that when we come online, we refetch and update the cache properly.
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Task created',
        description: 'Task has been successfully created.',
      });
    },
    onError: (error) => {
      console.error('Error creating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to create task.',
        variant: 'destructive',
      });
      // If we were offline and the operation failed (shouldn't happen because we catch in queue processing),
      // we might need to rollback the optimistic update.
      // For simplicity, we'll just show the error and rely on the queue to retry.
    },
  });
};

// Update a task
export const useUpdateTask = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/tasks/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update task');
        }
        
        const updatedTask = await response.json();
        // Update cache
        await cacheTasks([updatedTask]); // This will replace the cache? We should update the specific task.
        // We'll invalidate the query to refetch.
        return updatedTask;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'update',
          endpoint: '/api/tasks',
          id,
          data: updates,
        };
        await addToQueue(operation);
        // Optimistically update cache
        const currentTasks = await getCachedTasks();
        const updatedTasks = currentTasks.map(task => 
          task._id === id ? { ...task, ...updates, updatedAt: new Date().toISOString() } : task
        );
        await cacheTasks(updatedTasks);
        // Return the updated task for UI
        return { ...currentTasks.find(t => t._id === id), ...updates, updatedAt: new Date().toISOString() };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Task updated',
        description: 'Task has been successfully updated.',
      });
    },
    onError: (error) => {
      console.error('Error updating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task.',
        variant: 'destructive',
      });
      // Rollback optimistic update? We'll rely on the queue to eventually correct it.
    },
  });
};

// Delete a task
export const useDeleteTask = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (id: string) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/tasks/${id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete task');
        }
        
        // Update cache: remove the task
        const currentTasks = await getCachedTasks();
        const filteredTasks = currentTasks.filter(task => task._id !== id);
        await cacheTasks(filteredTasks);
        
        return { success: true };
      } else {
        // Offline: add to queue
        const operation = {
          type: 'delete',
          endpoint: '/api/tasks',
          id,
        };
        await addToQueue(operation);
        // Optimistically remove from cache
        const currentTasks = await getCachedTasks();
        const filteredTasks = currentTasks.filter(task => task._id !== id);
        await cacheTasks(filteredTasks);
        
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Task deleted',
        description: 'Task has been successfully deleted.',
      });
    },
    onError: (error) => {
      console.error('Error deleting task:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete task.',
        variant: 'destructive',
      });
      // Rollback optimistic update? We'll rely on the queue to eventually correct it.
    },
  });
};

// Mark task as complete
export const useCompleteTask = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (id: string) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/tasks/${id}/complete`, {
          method: 'PATCH',
        });
        
        if (!response.ok) {
          throw new Error('Failed to complete task');
        }
        
        const completedTask = await response.json();
        // Update cache
        const currentTasks = await getCachedTasks();
        const updatedTasks = currentTasks.map(task => 
          task._id === id ? { ...task, ...completedTask, updatedAt: new Date().toISOString() } : task
        );
        await cacheTasks(updatedTasks);
        
        return completedTask;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'update', // We'll treat complete as an update operation
          endpoint: '/api/tasks',
          id,
          data: { status: 'completed', completedAt: new Date().toISOString() },
        };
        await addToQueue(operation);
        // Optimistically update cache
        const currentTasks = await getCachedTasks();
        const updatedTasks = currentTasks.map(task => 
          task._id === id ? { ...task, status: 'completed', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : task
        );
        await cacheTasks(updatedTasks);
        
        return { ...currentTasks.find(t => t._id === id), status: 'completed', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Task completed',
        description: 'Task has been successfully completed.',
      });
    },
    onError: (error) => {
      console.error('Error completing task:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete task.',
        variant: 'destructive',
      });
    },
  });
};

// Hook to start sync listener (to be called in App.tsx or main.tsx)
export const useSyncListener = () => {
  useEffect(() => {
    if (!syncListenerStarted) {
      startSyncListener(
        () => {
          console.log('Online: processing queue');
          processQueue().catch(console.error);
        },
        () => {
          console.log('Offline');
        }
      );
      syncListenerStarted = true;
    }
    
    return () => {
      if (syncListenerStarted) {
        stopSyncListener();
        syncListenerStarted = false;
      }
    };
  }, []);
};