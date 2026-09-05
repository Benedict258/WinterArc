import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { initDB, cacheGoals, getCachedGoals, clearCache } from '@/lib/storage';
import { initSyncDB, addToQueue, isOnline, startSyncListener, stopSyncListener, processQueue } from '@/lib/syncQueue';

// Types
export type Goal = {
  _id: string;
  period: string;
  text: string;
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

// Fetch all goals
export const useGoals = () => {
  const queryClient = useQueryClient();
  
  // Initialize DB on first call
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      try {
        const apiGoals = await fetchGoalsFromAPI();
        await cacheGoals(apiGoals);
        return apiGoals;
      } catch (err) {
        console.warn('Failed to fetch goals from API, using cache:', err);
        const cachedGoals = await getCachedGoals();
        if (cachedGoals.length > 0) {
          return cachedGoals;
        }
        return [];
      }
    },
  });
};

// Helper to fetch goals from API
const fetchGoalsFromAPI = async (): Promise<Goal[]> => {
  const response = await fetch(`${API_URL}/api/goals`);
  if (!response.ok) {
    throw new Error('Failed to fetch goals');
  }
  return response.json();
};

// Create a new goal
export const useCreateGoal = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (newGoal: Omit<Goal, '_id' | 'createdAt' | 'updatedAt'>) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/goals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newGoal),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create goal');
        }
        
        const createdGoal = await response.json();
        // Update cache
        await cacheGoals([createdGoal]); // This will replace the cache? We should add to cache.
        // We'll invalidate the query to refetch.
        return createdGoal;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'create',
          endpoint: '/api/goals',
          data: newGoal,
        };
        await addToQueue(operation);
        // Optimistically add to cache
        const tempGoal = {
          ...newGoal,
          _id: `temp-${Date.now()}`, // Temporary ID
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const currentGoals = await getCachedGoals();
        await cacheGoals([...currentGoals, tempGoal]);
        // Return the temp goal so the UI can use it
        return tempGoal;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast({
        title: 'Goal created',
        description: 'Goal has been successfully created.',
      });
    },
    onError: (error) => {
      console.error('Error creating goal:', error);
      toast({
        title: 'Error',
        description: 'Failed to create goal.',
        variant: 'destructive',
      });
    },
  });
};

// Update a goal
export const useUpdateGoal = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Goal> }) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/goals/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update goal');
        }
        
        const updatedGoal = await response.json();
        // Update cache
        await cacheGoals([updatedGoal]); // This will replace the cache? We should update the specific goal.
        // We'll invalidate the query to refetch.
        return updatedGoal;
      } else {
        // Offline: add to queue
        const operation = {
          type: 'update',
          endpoint: '/api/goals',
          id,
          data: updates,
        };
        await addToQueue(operation);
        // Optimistically update cache
        const currentGoals = await getCachedGoals();
        const updatedGoals = currentGoals.map(goal => 
          goal._id === id ? { ...goal, ...updates, updatedAt: new Date().toISOString() } : goal
        );
        await cacheGoals(updatedGoals);
        // Return the updated goal for UI
        return { ...currentGoals.find(g => g._id === id), ...updates, updatedAt: new Date().toISOString() };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast({
        title: 'Goal updated',
        description: 'Goal has been successfully updated.',
      });
    },
    onError: (error) => {
      console.error('Error updating goal:', error);
      toast({
        title: 'Error',
        description: 'Failed to update goal.',
        variant: 'destructive',
      });
    },
  });
};

// Delete a goal
export const useDeleteGoal = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    initialize().catch(console.error);
  }, []);

  return useMutation({
    mutationFn: async (id: string) => {
      if (isOnline()) {
        // Online: send to API directly
        const response = await fetch(`${API_URL}/api/goals/${id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete goal');
        }
        
        // Update cache: remove the goal
        const currentGoals = await getCachedGoals();
        const filteredGoals = currentGoals.filter(goal => goal._id !== id);
        await cacheGoals(filteredGoals);
        
        return { success: true };
      } else {
        // Offline: add to queue
        const operation = {
          type: 'delete',
          endpoint: '/api/goals',
          id,
        };
        await addToQueue(operation);
        // Optimistically remove from cache
        const currentGoals = await getCachedGoals();
        const filteredGoals = currentGoals.filter(goal => goal._id !== id);
        await cacheGoals(filteredGoals);
        
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast({
        title: 'Goal deleted',
        description: 'Goal has been successfully deleted.',
      });
    },
    onError: (error) => {
      console.error('Error deleting goal:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete goal.',
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