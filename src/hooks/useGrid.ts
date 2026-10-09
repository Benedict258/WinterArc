import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

export type GridTask = {
  _id: string;
  title: string;
  threadId: string | null;
  date: string;
  timeBlock: string;
  status: string;
  source: string;
  priority: 'low' | 'medium' | 'high';
  intensity: 'light' | 'medium' | 'heavy';
};

export type ForecastTask = {
  kind: 'due' | 'queued' | 'placeholder';
  threadId: string | null;
  taskId: string | null;
  title: string;
  timeBlock: 'morning' | 'afternoon' | 'evening';
  priority: 'low' | 'medium' | 'high';
  intensity: 'light' | 'medium' | 'heavy';
  dueKey: string | null;
  /** YYYY-MM-DD */
  date: string;
};

export type WeekResponse = {
  weekStart: string;
  week: (GridTask & { dueDate?: string | null })[];
  forecast: ForecastTask[];
};

export type GridBalancing = {
  maxDailyIntensity: number;
  preferLowIntensityOnBusyDays: boolean;
};

import { API_URL } from '@/lib/api'

export const useWeek = (startDate: string) => {
  return useQuery({
    queryKey: ['week', startDate],
    queryFn: async (): Promise<WeekResponse> => {
      const response = await fetch(`${API_URL}/api/grid/week/${startDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch week data');
      }
      return response.json();
    },
  });
};

export const useGridSettings = () => {
  return useQuery({
    queryKey: ['grid-settings'],
    queryFn: async (): Promise<GridBalancing> => {
      const response = await fetch(`${API_URL}/api/grid/settings`);
      if (!response.ok) {
        throw new Error('Failed to fetch grid settings');
      }
      return response.json();
    },
  });
};

export const useUpdateGridSettings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (updates: Partial<GridBalancing>) => {
      const response = await fetch(`${API_URL}/api/grid/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update grid settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grid-settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // The forecast for upcoming days uses these limits immediately
      queryClient.invalidateQueries({ queryKey: ['week'] });
      toast({ title: 'Grid balancing saved', description: 'Upcoming days use it now. Rebalance week to apply it to today too.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update grid balancing.', variant: 'destructive' });
    },
  });
};

export type RebalanceResult = {
  dayKey: string;
  weekStart: string;
  removedPlaceholders: number;
  returnedToQueue: number;
  removedFutureLeftovers: number;
  scheduled: number;
  load: number;
  maxDailyIntensity: number;
  forecastLoads: Record<string, number>;
};

/**
 * Rebalance the current week with the current grid balancing, frequency
 * targets and queues: re-plans today, sends unfinished scheduler-placed
 * tasks from earlier days back to their queues, clears old-generator
 * leftovers from the rest of the week. Your own and completed tasks stay put.
 */
export const useRebalanceWeek = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (): Promise<RebalanceResult> => {
      const response = await fetch(`${API_URL}/api/grid/rebalance`, { method: 'POST' });
      if (!response.ok) throw new Error(response.status === 404 ? 'Backend is out of date — redeploy it' : 'Failed to rebalance');
      return response.json();
    },
    onSuccess: (r) => {
      for (const key of ['tasks', 'week', 'thread-stats', 'analytics']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({
        title: 'Week rebalanced',
        description: `Today: ${r.scheduled} scheduled, load ${r.load}/${r.maxDailyIntensity}. Rest of the week follows the cap.`,
      });
    },
    onError: (e) => {
      toast({ title: "Couldn't rebalance", description: e instanceof Error ? e.message : 'Failed to rebalance.', variant: 'destructive' });
    },
  });
};
