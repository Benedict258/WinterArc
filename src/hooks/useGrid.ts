import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { gridRegenerateSchema } from '@/utils/validation';

// Types
export type GridTask = {
  _id: string;
  title: string;
  threadId: string | null;
  date: string; // ISO date string
  timeBlock: string;
  status: string;
  source: string;
};

// API URL
const API_URL = import.meta.env.VITE_API_URL || '';

// Fetch week data
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

// Regenerate week
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