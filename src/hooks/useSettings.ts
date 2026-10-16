import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { cacheSettings, getCachedSettings } from '@/lib/storage';
import { addToQueue } from '@/lib/syncQueue';
import { onlineOrQueue } from '@/lib/offline';

// Types
import type { NotificationSettings } from '@/shared/notificationPlan'
import type { DayBlock } from '@/shared/dayBlocks'
import type { Appearance, Modules } from '@/shared/appearance'
import type { FocusPrefs } from '@/shared/focus'
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
  appearance?: Partial<Appearance>;
  modules?: Partial<Modules>;
  focus?: Partial<FocusPrefs>;
  planner?: {
    rollover?: boolean;
    makeup?: boolean;
    backlogPerDay?: number;
    dueWindowDays?: number;
    blocks?: DayBlock[];
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

const GROUPS = ['planner', 'notifications', 'gridBalancing', 'appearance', 'modules', 'focus'] as const

/** Apply a partial update locally the way the server does: nested groups merge field by field. */
export function mergeSettings(current: any, updates: Partial<Settings>) {
  const merged: any = { ...current, ...updates }
  for (const g of GROUPS) {
    if (updates[g]) merged[g] = { ...current?.[g], ...updates[g] }
  }
  return merged
}

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
        const local = mergeSettings(current, updates);
        if (current) await cacheSettings(local);
        return local;
      });
    },
    // Show the change straight away; the server's answer replaces it (or it is rolled back on error)
    onMutate: async (updates: Partial<Settings>) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] });
      const previous = queryClient.getQueryData(['settings']);
      if (previous) queryClient.setQueryData(['settings'], mergeSettings(previous, updates));
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      window.dispatchEvent(new Event('winterarc-data-changed'));
      // Frequency target / timezone change the forecast
      queryClient.invalidateQueries({ queryKey: ['week'] });
      // The Settings page shows its own confirmation
    },
    onError: (_error, _updates, context) => {
      if (context?.previous) queryClient.setQueryData(['settings'], context.previous);
      toast({
        title: 'Error',
        description: 'Failed to update settings.',
        variant: 'destructive',
      });
    },
  });
};