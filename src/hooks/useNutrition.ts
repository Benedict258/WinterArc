import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import type { Macros, MealInput, MealSlot, NutritionGoals, Remaining } from '@/shared/nutrition'

export type Meal = Macros & { id: string; day: string; slot: MealSlot; text: string; items: ({ name: string } & Macros)[]; source: string }
export type DayRow = Macros & { day: string; meals: number }
export type NutritionOverview = {
  today: string; goals: NutritionGoals; todayMeals: Meal[]; eaten: Macros; remaining: Remaining
  split: { protein: number; carbs: number; fat: number } | null
  days: DayRow[]; average: Macros & { daysLogged: number }; average30: Macros & { daysLogged: number }
  streak: number; recent: Meal[]
}
export type Estimate = { items: ({ name: string } & Macros)[]; total: Macros; note: string }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { code: data.code as string | undefined })
  return data as T
}

export const useNutrition = (days = 14) => useQuery({ queryKey: ['nutrition', days], queryFn: () => call<NutritionOverview>(`/api/nutrition/overview?days=${days}`) })

export function useNutritionMutations() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['nutrition'] })
  const onError = (title: string) => (e: Error) => toast({ title, description: e.message, variant: 'destructive' })
  return {
    saveMeal: useMutation({
      mutationFn: (v: { id: string | null; meal: MealInput; source?: 'manual' | 'estimate' }) => (v.id ? call(`/api/nutrition/meals/${v.id}`, 'PUT', v.meal) : call('/api/nutrition/meals', 'POST', { ...v.meal, source: v.source ?? 'manual' })),
      onSuccess: refresh, onError: onError('Couldn’t save the meal'),
    }),
    deleteMeal: useMutation({ mutationFn: (id: string) => call(`/api/nutrition/meals/${id}`, 'DELETE'), onSuccess: refresh, onError: onError('Couldn’t delete it') }),
    estimate: useMutation({ mutationFn: (text: string) => call<Estimate>('/api/ai/estimate-meal', 'POST', { text }) }),
  }
}
