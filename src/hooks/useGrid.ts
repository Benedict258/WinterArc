import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { gridRegenerateSchema } from '@/utils/validation';

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

export type GridBalancing = {
  maxDailyIntensity: number;
  preferLowIntensityOnBusyDays: boolean;
};

const API_URL = import.meta.env.VITE_API_URL || '';

export const useWeek = (startDate: string) => {
  return useQuery({
    queryKey: ['week', startDate],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/grid/week/${startDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch week data');
      }
      return response.json();
    },
  });
};

export const useRegenerateWeek = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (startDate: string) => {
      const response = await fetch(`${API_URL}/api/grid/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: startDate }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate week');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Week regenerated',
        description: 'Week schedule has been successfully rebalanced.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to regenerate week.',
        variant: 'destructive',
      });
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
