import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'

// Types
export type CalendarStatus = 'disconnected' | 'connected' | 'connecting' | 'error'

export type CalendarEvent = {
  id: string
  title: string
  description?: string
  start: string // ISO date string
  end: string   // ISO date string
}

// API URL
const API_URL = import.meta.env.VITE_API_URL || ''

// Pull calendar events for a given date
export const useCalendarEvents = (date: Date | string) => {
  const dateStr = typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0]
  return useQuery({
    queryKey: ['calendar-events', dateStr],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_URL}/api/calendar/events?date=${dateStr}`)
        if (!response.ok) return []
        const data = await response.json()
        return data.events || []
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000,
  })
}

export const useCalendar = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // Get calendar connection status
  const { data: statusData, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['calendar-status'],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_URL}/api/calendar/status`)
        if (!response.ok) return { connected: false, lastSyncedAt: null }
        return await response.json()
      } catch {
        return { connected: false, lastSyncedAt: null }
      }
    },
  })

  const status: CalendarStatus = statusData?.connected ? 'connected' : 'disconnected'
  const lastSyncedAt = statusData?.lastSyncedAt || null
  
  // Connect to Google Calendar (initiates OAuth flow or sets local connected)
  const { 
    mutate: connectCalendar, 
    isPending: isConnecting,
    isError: isConnectError,
    error: connectError
  } = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/calendar/auth`)
      if (!response.ok) {
        throw new Error('Failed to get auth URL')
      }
      const data = await response.json()
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-status'] })
      if (data?.connected) {
        toast({
          title: 'Google Calendar Connected',
          description: 'Calendar integration is now active and ready to sync.',
        })
      } else if (data?.authUrl) {
        if (data.authUrl.startsWith('http')) {
          window.open(data.authUrl, '_blank')
        } else {
          toast({
            title: 'Google Calendar Connected',
            description: 'Calendar integration is active.',
          })
        }
      }
    },
    onError: () => {
      toast({
        title: 'Connection Failed',
        description: 'Failed to initiate Google Calendar connection.',
        variant: 'destructive'
      })
    }
  })
  
  // Disconnect from Google Calendar
  const { 
    mutate: disconnectCalendar, 
    isPending: isDisconnecting,
    isError: isDisconnectError,
    error: disconnectError
  } = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/calendar/disconnect`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('Failed to disconnect')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-status'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      toast({
        title: 'Disconnected',
        description: 'Google Calendar has been disconnected.',
      })
    },
    onError: () => {
      toast({
        title: 'Disconnect Failed',
        description: 'Failed to disconnect from Google Calendar.',
        variant: 'destructive'
      })
    }
  })
  
  // Sync calendar
  const { 
    mutate: syncCalendar, 
    isPending: isSyncing,
    isError: isSyncError,
    error: syncError
  } = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/calendar/sync`, {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error('Sync failed')
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-status'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      toast({
        title: 'Sync Completed',
        description: `Calendar sync completed${data?.lastSyncedAt ? ' just now' : ''}.`,
      })
    },
    onError: () => {
      toast({
        title: 'Sync Failed',
        description: 'Calendar sync failed.',
        variant: 'destructive'
      })
    }
  })
  
  return {
    calendarStatus: status,
    lastSyncedAt,
    isLoadingStatus: statusLoading,
    errorStatus: statusError,
    
    connectCalendar,
    isConnecting,
    isConnectError,
    connectError,
    
    disconnectCalendar,
    isDisconnecting,
    isDisconnectError,
    disconnectError,
    
    useCalendarEvents,
    
    syncCalendar,
    isSyncing,
    isSyncError,
    syncError
  }
}