import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import type { Best, FitnessPrefs, Metric, WorkoutInput } from '@/shared/fitness'

export type Workout = WorkoutInput & { id: string; source: string }
export type StepDayPoint = { day: string; steps: number; source: 'device' | 'manual' | null }
export type Overview = {
  today: string; prefs: FitnessPrefs
  steps: StepDayPoint[]
  stepStats: { avg7: number; avg30: number; goalDays7: number; streak: number; best: { day: string; steps: number } | null }
  todaySteps: number
  workouts: Workout[]
  week: { start: string; count: number; minutes: number; km: number; goal: number }
  weeks: { start: string; count: number; minutes: number }[]
  bests: Best[]
  metrics: (Metric & { syncedFields: string[] })[]
  weightTrend: { day: string; value: number }[]
  weightChange30: number | null
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data as T
}

export const useFitness = (days = 30) => useQuery({ queryKey: ['fitness', days], queryFn: () => call<Overview>(`/api/fitness/overview?days=${days}`) })

export function useFitnessMutations() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fitness'] })
  const onError = (title: string) => (e: Error) => toast({ title, description: e.message, variant: 'destructive' })
  return {
    saveWorkout: useMutation({
      mutationFn: (v: { id: string | null; workout: WorkoutInput }) => (v.id ? call(`/api/fitness/workouts/${v.id}`, 'PUT', v.workout) : call('/api/fitness/workouts', 'POST', v.workout)),
      onSuccess: refresh, onError: onError('Couldn’t save the workout'),
    }),
    deleteWorkout: useMutation({ mutationFn: (id: string) => call(`/api/fitness/workouts/${id}`, 'DELETE'), onSuccess: refresh, onError: onError('Couldn’t delete it') }),
    saveSteps: useMutation({ mutationFn: (v: { day: string; steps: number }) => call(`/api/fitness/steps/${v.day}`, 'PUT', { steps: v.steps }), onSuccess: refresh, onError: onError('Couldn’t save the steps') }),
    saveMetric: useMutation({ mutationFn: (v: { day: string; values: Partial<Metric> }) => call(`/api/fitness/metrics/${v.day}`, 'PUT', v.values), onSuccess: refresh, onError: onError('Couldn’t save that') }),
    deleteMetric: useMutation({ mutationFn: (day: string) => call(`/api/fitness/metrics/${day}`, 'DELETE'), onSuccess: refresh, onError: onError('Couldn’t delete it') }),
  }
}
