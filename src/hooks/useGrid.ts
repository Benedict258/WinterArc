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
      toast({ title: 'Grid balancing updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update grid balancing.', variant: 'destructive' });
    },
  });
};
