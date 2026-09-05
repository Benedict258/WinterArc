import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

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
const API_URL = import.meta.env.VITE_API_URL || '';

// Fetch all wishlist items
export const useWishlist = () => {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/wishlist`);
      if (!response.ok) {
        throw new Error('Failed to fetch wishlist items');
      }
      return response.json();
    },
  });
};

// Create a new wishlist item
export const useCreateWishlistItem = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (newItem: Omit<WishlistItem, '_id' | 'createdAt' | 'updatedAt'>) => {
      const response = await fetch(`${API_URL}/api/wishlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create wishlist item');
      }
      
      return response.json();
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
      const response = await fetch(`${API_URL}/api/wishlist/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update wishlist item');
      }
      
      return response.json();
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
      const response = await fetch(`${API_URL}/api/wishlist/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete wishlist item');
      }
      
      return { success: true };
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