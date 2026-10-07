import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

// Types
export type Settings = {
  _id: string;
  timezone: string;
  weeklyGenerationRules: any;
  multipleThreadsPerWeekTarget: number;
  gridBalancing?: {
    maxDailyIntensity: number;
    preferLowIntensityOnBusyDays: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

// API URL
import { API_URL } from '@/lib/api'

// Fetch settings
export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      return response.json();
    },
  });
};

// Update settings
export const useUpdateSettings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (updates: Partial<Settings>) => {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update settings');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // Frequency target / timezone change the forecast
      queryClient.invalidateQueries({ queryKey: ['week'] });
      // The Settings page shows its own confirmation
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update settings.',
        variant: 'destructive',
      });
    },
  });
};