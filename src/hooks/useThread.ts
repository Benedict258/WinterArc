import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import type { Thread, ThreadResource } from './useThreads'

const API_URL = import.meta.env.VITE_API_URL || ''

export type ThreadStats = {
  tasksThisQuarter: { total: number; completed: number; rate: number }
  tasksAllTime: { total: number; completed: number }
  streakDays: number
  lastActivity: string | null
  upcomingTasks: { _id: string; title: string; date: string; timeBlock: string; status: string }[]
}

export const useThread = (id: string | undefined) => {
  return useQuery({
    queryKey: ['thread', id],
    queryFn: async (): Promise<Thread> => {
      if (!id) throw new Error('No id')
      const res = await fetch(`${API_URL}/api/threads`)
      if (!res.ok) throw new Error('Failed to fetch threads')
      const all: Thread[] = await res.json()
      const t = all.find(x => x._id === id)
      if (!t) throw new Error('Thread not found')
      return t
    },
    enabled: !!id,
  })
}

export const useThreadStats = (id: string | undefined) => {
  return useQuery({
    queryKey: ['thread-stats', id],
    queryFn: async (): Promise<ThreadStats> => {
      if (!id) throw new Error('No id')
      const res = await fetch(`${API_URL}/api/threads/${id}/stats`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!id,
    refetchOnMount: 'always',
  })
}

export const useAddResource = (id: string) => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (input: { title: string; url: string; description?: string; kind?: 'link' | 'resource' }) => {
      const res = await fetch(`${API_URL}/api/threads/${id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to add resource')
      return res.json() as Promise<ThreadResource>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', id] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      toast({ title: 'Resource added' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add resource.', variant: 'destructive' })
    },
  })
}

export const useDeleteResource = (id: string) => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (resourceId: string) => {
      const res = await fetch(`${API_URL}/api/threads/${id}/resources/${resourceId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete resource')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', id] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      toast({ title: 'Resource removed' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to remove resource.', variant: 'destructive' })
    },
  })
}
