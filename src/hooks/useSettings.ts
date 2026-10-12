import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { cacheSettings, getCachedSettings } from '@/lib/storage';
import { addToQueue } from '@/lib/syncQueue';
import { onlineOrQueue } from '@/lib/offline';

// Types
import type { NotificationSettings } from '@/shared/notificationPlan'
export type Settings = {
  _id: string;
  timezone: string;
  weeklyGenerationRules: any;
  multipleThreadsPerWeekTarget: number;
  gridBalancing?: {
    maxDailyIntensity: number;
    preferLowIntensityOnBusyDays: boolean;
  };
  notifications?: NotificationSettings;
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
      try {
        const response = await fetch(`${API_URL}/api/settings`);
        if (!response.ok) throw new Error('Failed to fetch settings');
        const settings = await response.json();
        await cacheSettings(settings);
        return settings;
      } catch (err) {
        // Offline: last known settings, with queued edits already applied
        const cached = await getCachedSettings();
        if (cached) return cached;
        throw err;
      }
    },
  });
};

// Update settings
export const useUpdateSettings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (updates: Partial<Settings>) => {
      return onlineOrQueue(async () => {
        const response = await fetch(`${API_URL}/api/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update settings');
        const updated = await response.json();
        await cacheSettings(updated);
        return updated;
      }, async () => {
        await addToQueue({ type: 'request', method: 'PUT', url: '/api/settings', data: updates });
        const current = await getCachedSettings();
        const local = {
          ...current,
          ...updates,
          gridBalancing: { ...current?.gridBalancing, ...updates.gridBalancing },
        };
        if (current) await cacheSettings(local);
        return local;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      window.dispatchEvent(new Event('winterarc-data-changed'));
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