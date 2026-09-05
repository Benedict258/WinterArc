import { useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL || ''

export type AnalyticsSummary = {
  period: string
  periodStart: string
  periodEnd: string
  streak: number
  completionRate: number
  completed: number
  total: number
  activeThreads: number
  totalThreads: number
}

export type ThreadStat = {
  _id: string
  name: string
  category: string
  frequency: string
  status: string
  total: number
  completed: number
  rate: number
}

export const useAnalyticsSummary = () =>
  useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/analytics/summary`)
      if (!res.ok) throw new Error('Failed to fetch analytics summary')
      return res.json()
    },
    staleTime: 30 * 1000,
  })

export const useThreadAnalytics = () =>
  useQuery<{ period: { start: string; end: string }; threads: ThreadStat[] }>({
    queryKey: ['analytics', 'threads'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/analytics/threads`)
      if (!res.ok) throw new Error('Failed to fetch thread analytics')
      return res.json()
    },
    staleTime: 30 * 1000,
  })
