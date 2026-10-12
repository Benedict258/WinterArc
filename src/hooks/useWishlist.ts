import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { cacheWishlist, upsertCachedWishlist, removeCachedWishlistItem, getCachedWishlist } from '@/lib/storage';
import { addToQueue } from '@/lib/syncQueue';
import { onlineOrQueue, newId } from '@/lib/offline';

// Types
export type WishlistItem = {
  _id: string;
  item: string;
  note: string | null;
  acquired: boolean;
  createdAt: string;
  updatedAt: string;
};

// API URL
import { API_URL } from '@/lib/api'

// Fetch all wishlist items (falls back to the local copy, which includes queued offline edits)
export const useWishlist = () => {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: async (): Promise<WishlistItem[]> => {
      try {
        const response = await fetch(`${API_URL}/api/wishlist`);
        if (!response.ok) throw new Error('Failed to fetch wishlist items');
        const items = await response.json();
        await cacheWishlist(items);
        return items;
      } catch (err) {
        console.warn('Failed to fetch wishlist, using cache:', err);
        return getCachedWishlist();
      }
    },
  });
};

const json = { 'Content-Type': 'application/json' };

// Create a new wishlist item
export const useCreateWishlistItem = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (newItem: Omit<WishlistItem, '_id' | 'createdAt' | 'updatedAt'>) => {
      const body = { ...newItem, _id: newId() };
      return onlineOrQueue(async () => {
        const response = await fetch(`${API_URL}/api/wishlist`, { method: 'POST', headers: json, body: JSON.stringify(body) });
        if (!response.ok) throw new Error('Failed to create wishlist item');
        const created = await response.json();
        await upsertCachedWishlist([created]);
        return created;
      }, async () => {
        await addToQueue({ type: 'create', endpoint: '/api/wishlist', data: body });
        const now = new Date().toISOString();
        const local = { ...body, acquired: body.acquired ?? false, createdAt: now, updatedAt: now };
        await upsertCachedWishlist([local]);
        return local;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast({
        title: 'Item added',
        description: 'Item has been successfully added to wishlist.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to add item to wishlist.',
        variant: 'destructive',
      });
    },
  });
};

// Update a wishlist item
export const useUpdateWishlistItem = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WishlistItem> }) => {
      return onlineOrQueue(async () => {
        const response = await fetch(`${API_URL}/api/wishlist/${id}`, { method: 'PUT', headers: json, body: JSON.stringify(updates) });
        if (!response.ok) throw new Error('Failed to update wishlist item');
        const updated = await response.json();
        await upsertCachedWishlist([updated]);
        return updated;
      }, async () => {
        await addToQueue({ type: 'update', endpoint: '/api/wishlist', id, data: updates });
        const current = (await getCachedWishlist()).find(i => i._id === id);
        const local = { ...current, ...updates, updatedAt: new Date().toISOString() };
        if (current) await upsertCachedWishlist([local]);
        return local;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast({
        title: 'Item updated',
        description: 'Item has been successfully updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update wishlist item.',
        variant: 'destructive',
      });
    },
  });
};

// Delete a wishlist item
export const useDeleteWishlistItem = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      return onlineOrQueue(async () => {
        const response = await fetch(`${API_URL}/api/wishlist/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete wishlist item');
        await removeCachedWishlistItem(id);
        return { success: true };
      }, async () => {
        await addToQueue({ type: 'delete', endpoint: '/api/wishlist', id });
        await removeCachedWishlistItem(id);
        return { success: true };
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast({
        title: 'Item removed',
        description: 'Item has been successfully removed from wishlist.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to remove item from wishlist.',
        variant: 'destructive',
      });
    },
  });
};
