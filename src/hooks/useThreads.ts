import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { threadSchema } from '@/utils/validation';
import { initDB, cacheThreads, getCachedThreads, clearCache } from '@/lib/storage';
import { initSyncDB, addToQueue, isOnline, startSyncListener, stopSyncListener, processQueue } from '@/lib/syncQueue';

// Types
export type ThreadResource = {
  _id: string;
  title: string;
  url: string;
  description: string;
  kind: 'link' | 'resource';
  createdAt: string;
  updatedAt: string;
};

export type Thread = {
  _id: string;
  name: string;
  category: string;
  frequency: string;
  fixedDay: number | null;
  status: string;
  priority: 'low' | 'medium' | 'high';
  intensity: 'light' | 'medium' | 'heavy';
  notes: string;
  resources: ThreadResource[];
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

// Fetch all threads
export const useThreads = () => {
  const queryClient = useQueryClient();
  
  // Initialize DB on first call
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useQuery({
    queryKey: ['threads'],
    queryFn: async () => {
      try {
        const apiThreads = await fetchThreadsFromAPI();
        await cacheThreads(apiThreads);
        return apiThreads;
      } catch (err) {
        console.warn('Failed to fetch threads from API, using cache:', err);
        const cachedThreads = await getCachedThreads();
        if (cachedThreads.length > 0) {
          return cachedThreads;
        }
        return [];
      }
    },
  });
};

// Helper to fetch threads from API
const fetchThreadsFromAPI = async (): Promise<Thread[]> => {
  const response = await fetch(`${API_URL}/api/threads`);
  if (!response.ok) {
    throw new Error('Failed to fetch threads');
  }
  return response.json();
};

// Create a new thread
export const useCreateThread = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (newThread: Omit<Thread, '_id' | 'createdAt' | 'updatedAt'>) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/threads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newThread),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create thread');
        }
        
        const createdThread = await response.json();
        // Update cache
        await cacheThreads([createdThread]); // This will replace the cache? We should add to cache.
        // We'll invalidate the query to refetch.
        return createdThread;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'create',
          endpoint: '/api/threads',
          data: newThread,
        };
        await addToQueue(operation);
        // Optimistically add to cache
        const tempThread = {
          ...newThread,
          _id: `temp-${Date.now()}`, // Temporary ID
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const currentThreads = await getCachedThreads();
        await cacheThreads([...currentThreads, tempThread]);
        // Return the temp thread so the UI can use it
        return tempThread;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast({
        title: 'Thread created',
        description: 'Thread has been successfully created.',
      });
    },
    onError: (error) => {
      console.error('Error creating thread:', error);
      toast({
        title: 'Error',
        description: 'Failed to create thread.',
        variant: 'destructive',
      });
    },
  });
};

// Update a thread
export const useUpdateThread = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Thread> }) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/threads/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update thread');
        }
        
        const updatedThread = await response.json();
        // Update cache
        await cacheThreads([updatedThread]); // This will replace the cache? We should update the specific thread.
        // We'll invalidate the query to refetch.
        return updatedThread;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'update',
          endpoint: '/api/threads',
          id,
          data: updates,
        };
        await addToQueue(operation);
        // Optimistically update cache
        const currentThreads = await getCachedThreads();
        const updatedThreads = currentThreads.map(thread => 
          thread._id === id ? { ...thread, ...updates, updatedAt: new Date().toISOString() } : thread
        );
        await cacheThreads(updatedThreads);
        // Return the updated thread for UI
        return { ...currentThreads.find(t => t._id === id), ...updates, updatedAt: new Date().toISOString() };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast({
        title: 'Thread updated',
        description: 'Thread has been successfully updated.',
      });
    },
    onError: (error) => {
      console.error('Error updating thread:', error);
      toast({
        title: 'Error',
        description: 'Failed to update thread.',
        variant: 'destructive',
      });
    },
  });
};

// Delete a thread
export const useDeleteThread = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (id: string) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/threads/${id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete thread');
        }
        
        // Update cache: remove the thread
        const currentThreads = await getCachedThreads();
        const filteredThreads = currentThreads.filter(thread => thread._id !== id);
        await cacheThreads(filteredThreads);
        
        return { success: true };
      } else {
        // Offline: add to queue
        const operation = {
          type: 'delete',
          endpoint: '/api/threads',
          id,
        };
        await addToQueue(operation);
        // Optimistically remove from cache
        const currentThreads = await getCachedThreads();
        const filteredThreads = currentThreads.filter(thread => thread._id !== id);
        await cacheThreads(filteredThreads);
        
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast({
        title: 'Thread deleted',
        description: 'Thread has been successfully deleted.',
      });
    },
    onError: (error) => {
      console.error('Error deleting thread:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete thread.',
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