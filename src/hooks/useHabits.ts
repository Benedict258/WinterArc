import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'

export type HabitDay = { day: string; value: number; done: boolean; scheduled: boolean }
export type Habit = {
  id: string; name: string; emoji: string; unit: string; weekdays: number[]; target: number; startedOn: string
  today: { value: number; done: boolean; scheduled: boolean }
  streak: { current: number; best: number }
  last14: HabitDay[]
  weekRate: number
  monthRate: number
}
export type HabitsResponse = { today: string; habits: Habit[] }
export type MonthRow = { month: string; scheduled: number; done: number; rate: number; total: number; perDay: number }
export type MonthlyResponse = {
  today: string
  overall: { month: string; rate: number; done: number; scheduled: number }[]
  habits: { id: string; name: string; emoji: string; rows: MonthRow[] }[]
}
export type CheckInInput = { day?: string; value?: number; add?: number }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data as T
}

export const useHabits = () => useQuery({ queryKey: ['habits'], queryFn: () => call<HabitsResponse>('/api/habits') })
export const useMonthly = () => useQuery({ queryKey: ['habits-monthly'], queryFn: () => call<MonthlyResponse>('/api/habits/monthly') })

/** Applies a check-in on screen straight away, then lets the server's answer replace it. */
export function useCheckIn() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ id, ...input }: CheckInInput & { id: string }) => call<{ milestone: number | null; name: string; emoji: string }>(`/api/habits/${id}/checkin`, 'POST', input),
    onMutate: async ({ id, day, value, add }) => {
      await queryClient.cancelQueries({ queryKey: ['habits'] })
      const before = queryClient.getQueryData<HabitsResponse>(['habits'])
      if (before) {
        queryClient.setQueryData<HabitsResponse>(['habits'], {
          ...before,
          habits: before.habits.map(h => {
            if (h.id !== id) return h
            const d = day ?? before.today
            const apply = (v: number) => Math.max(0, value !== undefined ? value : v + (add ?? 0))
            const last14 = h.last14.map(x => (x.day === d ? { ...x, value: apply(x.value), done: apply(x.value) >= h.target } : x))
            const t = last14.find(x => x.day === before.today)
            return { ...h, last14, today: t ? { ...h.today, value: t.value, done: t.done } : h.today }
          }),
        })
      }
      return { before }
    },
    onSuccess: r => {
      if (r.milestone) toast({ title: `${r.milestone}-day streak ${r.emoji}`.trim(), description: `You've kept up “${r.name}” for ${r.milestone} days in a row.` })
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(['habits'], ctx.before)
      toast({ title: 'Couldn’t save that', description: e.message, variant: 'destructive' })
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['habits'] }); queryClient.invalidateQueries({ queryKey: ['habits-monthly'] }) },
  })
}

export function useHabitMutations() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['habits'] }); queryClient.invalidateQueries({ queryKey: ['habits-monthly'] }) }
  const onError = (title: string) => (e: Error) => toast({ title, description: e.message, variant: 'destructive' })
  return {
    save: useMutation({
      mutationFn: (v: { id: string | null; habit: Record<string, unknown> }) => (v.id ? call(`/api/habits/${v.id}`, 'PUT', v.habit) : call('/api/habits', 'POST', v.habit)),
      onSuccess: refresh, onError: onError('Couldn’t save the habit'),
    }),
    archive: useMutation({ mutationFn: (id: string) => call(`/api/habits/${id}/archive`, 'POST', {}), onSuccess: refresh, onError: onError('Couldn’t archive it') }),
    remove: useMutation({ mutationFn: (id: string) => call(`/api/habits/${id}`, 'DELETE'), onSuccess: refresh, onError: onError('Couldn’t delete it') }),
  }
}
