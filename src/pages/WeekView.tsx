import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format, startOfWeek, addDays, addWeeks, isSameWeek } from 'date-fns'
import { useQueries } from '@tanstack/react-query'
import { useWeek, useRegenerateWeek } from '@/hooks/useGrid'
import { useThreads } from '@/hooks/useThreads'
import { useUpdateTask } from '@/hooks/useTasks'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Plus, CheckCircle2, Calendar as CalIcon } from 'lucide-react'
import QuickAddModal from '@/components/QuickAddModal'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const BLOCKS = ['morning', 'afternoon', 'evening'] as const

export default function WeekView() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 })
  const weekStartString = currentWeekStart.toISOString().split('T')[0]

  const { mutate: updateTask } = useUpdateTask()
  const { mutate: regenerateWeek, isPending: isRegenerating } = useRegenerateWeek()

  const { data: weekData = { week: [] }, isLoading: weekLoading, error: weekError } = useWeek(weekStartString)
  const tasks = weekData.week || []

  const { data: threads = [], isLoading: threadsLoading } = useThreads()

  const threadMap = new Map(threads.map(thread => [thread._id, thread.name]))

  const dayStrings = Array.from({ length: 7 }, (_, dayIndex) =>
    format(addDays(currentWeekStart, dayIndex), 'yyyy-MM-dd')
  )

  const tasksByDayAndBlock: Record<string, Record<string, any[]>> = {}
  for (const ds of dayStrings) tasksByDayAndBlock[ds] = { morning: [], afternoon: [], evening: [] }

  tasks.forEach((task: any) => {
    const taskDateStr = String(task.date || '').split('T')[0]
    const normBlock = (task.timeBlock || 'morning').toLowerCase()
    if (tasksByDayAndBlock[taskDateStr] && (BLOCKS as readonly string[]).includes(normBlock)) {
      tasksByDayAndBlock[taskDateStr][normBlock].push({
        id: task._id,
        title: task.title,
        threadId: task.threadId,
        threadName: task.threadId ? threadMap.get(task.threadId) || 'Unknown' : null,
        status: task.status,
        source: task.source,
      })
    }
  })

  const calendarQueries = useQueries({
    queries: dayStrings.map(dayDateStr => ({
      queryKey: ['calendar-events', dayDateStr],
      queryFn: async () => {
        try {
          const response = await fetch(`/api/calendar/events?date=${dayDateStr}`)
          if (!response.ok) return []
          const data = await response.json()
          return (data.events || []) as any[]
        } catch {
          return []
        }
      },
      staleTime: 60 * 1000,
    })),
  })

  const isLoading = (weekLoading && !tasks.length) || (threadsLoading && !threads.length)
  const hasError = weekError && !tasks.length

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Week View</h1>
          <p className="text-sm text-muted-foreground">Loading week schedule...</p>
        </div>
      </MainLayout>
    )
  }

  if (hasError) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Week View</h1>
          <p className="text-sm text-destructive">Error loading week data</p>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Week View</h1>
              {isCurrentWeek && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Current Week
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(currentWeekStart, 'MMM d')} – {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-sm">
              <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(prev => addWeeks(prev, -1))} className="h-8 w-8 p-0" title="Previous Week">
                <ChevronLeft size={16} />
              </Button>
              <Button variant={isCurrentWeek ? 'secondary' : 'ghost'} size="sm" onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="h-8 text-xs font-medium px-3">
                Today
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(prev => addWeeks(prev, 1))} className="h-8 w-8 p-0" title="Next Week">
                <ChevronRight size={16} />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => regenerateWeek(weekStartString)} disabled={isRegenerating} className="gap-1.5 h-9 text-xs">
              <RefreshCw size={14} className={isRegenerating ? 'animate-spin' : ''} />
              <span className="hidden xs:inline sm:inline">{isRegenerating ? 'Rebalancing...' : 'Regenerate'}</span>
            </Button>

            <Button size="sm" onClick={() => setQuickAddOpen(true)} className="gap-1.5 h-9 text-xs">
              <Plus size={14} />
              <span>Add</span>
            </Button>
          </div>
        </div>

        {/* Mobile: stacked day list (≤ md) */}
        <div className="md:hidden space-y-3">
          {dayStrings.map((dayDateStr, dayIndex) => {
            const dayDate = addDays(currentWeekStart, dayIndex)
            const isToday = dayDate.toDateString() === new Date().toDateString()
            const calendarEvents = (calendarQueries[dayIndex]?.data as any[]) || []
            const dayTotal = (Object.values(tasksByDayAndBlock[dayDateStr]) as any[][]).reduce((s, arr) => s + arr.length, 0)
            const dayDone = (Object.values(tasksByDayAndBlock[dayDateStr]) as any[][]).reduce(
              (s, arr) => s + arr.filter((t: any) => t.status === 'done').length, 0
            )

            return (
              <Card key={dayDateStr} className={isToday ? 'ring-2 ring-primary/40' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">{DAY_LABELS_FULL[dayIndex]}</CardTitle>
                      <CardDescription className="text-xs">{format(dayDate, 'EEE, MMM d')}</CardDescription>
                    </div>
                    {isToday ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-medium">Today</span>
                    ) : dayTotal > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">{dayDone}/{dayTotal}</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {BLOCKS.map(block => {
                    const blockTasks = tasksByDayAndBlock[dayDateStr][block]
                    if (blockTasks.length === 0) return null
                    return (
                      <div key={block}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{block}</p>
                        <div className="space-y-1">
                          {blockTasks.map(task => (
                            <TaskRow key={task.id} task={task} updateTask={updateTask} />
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {dayTotal === 0 && calendarEvents.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">No tasks or events</p>
                  )}

                  {calendarEvents.length > 0 && (
                    <div className="pt-2 mt-2 border-t">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <CalIcon size={10} /> Events
                      </p>
                      <div className="space-y-1">
                        {calendarEvents.map((event: any, idx: number) => (
                          <div key={`${dayDateStr}-ev-${idx}`} className="flex items-center gap-2 p-2 rounded bg-secondary/70 text-xs">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{event.title}</p>
                              <p className="text-muted-foreground">
                                {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Tablet & desktop: 7-column grid (≥ md) */}
        <div className="hidden md:grid md:grid-cols-7 gap-2 lg:gap-3">
          {dayStrings.map((dayDateStr, dayIndex) => {
            const dayDate = addDays(currentWeekStart, dayIndex)
            const isToday = dayDate.toDateString() === new Date().toDateString()
            const calendarEvents = (calendarQueries[dayIndex]?.data as any[]) || []
            const dayTotal = (Object.values(tasksByDayAndBlock[dayDateStr]) as any[][]).reduce((s, arr) => s + arr.length, 0)
            const dayDone = (Object.values(tasksByDayAndBlock[dayDateStr]) as any[][]).reduce(
              (s, arr) => s + arr.filter((t: any) => t.status === 'done').length, 0
            )

            return (
              <Card key={dayDateStr} className={`flex flex-col min-w-0 ${isToday ? 'ring-2 ring-primary/40' : ''}`}>
                <CardHeader className="pb-2 px-3">
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{DAYS[dayIndex]}</CardTitle>
                      <CardDescription className="text-[11px]">{format(dayDate, 'MMM d')}</CardDescription>
                    </div>
                    {isToday ? (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-primary text-primary-foreground font-medium shrink-0">Today</span>
                    ) : dayTotal > 0 ? (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-medium shrink-0">{dayDone}/{dayTotal}</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-2 pt-0 px-2 pb-2">
                  {BLOCKS.map(block => {
                    const blockTasks = tasksByDayAndBlock[dayDateStr][block]
                    return (
                      <div key={block} className="p-1.5 rounded bg-secondary/40">
                        <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-0.5">{block}</p>
                        {blockTasks.length > 0 ? (
                          <div className="space-y-1">
                            {blockTasks.map(task => (
                              <TaskRow key={task.id} task={task} updateTask={updateTask} compact />
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/70 px-1 pb-1">—</p>
                        )}
                      </div>
                    )
                  })}

                  {calendarEvents.length > 0 && (
                    <div className="mt-1 pt-2 border-t">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 px-0.5">Events</p>
                      <div className="space-y-1">
                        {calendarEvents.map((event: any, idx: number) => (
                          <div key={`${dayDateStr}-ev-${idx}`} className="p-1.5 rounded bg-secondary/70 text-[11px]">
                            <p className="font-medium truncate">{event.title}</p>
                            <p className="text-muted-foreground text-[10px]">
                              {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <QuickAddModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </MainLayout>
  )
}

function TaskRow({ task, updateTask, compact = false }: { task: any; updateTask: any; compact?: boolean }) {
  return (
    <div className={`flex items-start gap-1.5 p-1.5 rounded bg-secondary hover:bg-secondary/80 transition-colors ${compact ? 'text-[11px]' : 'text-sm'}`}>
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={() => {
          updateTask({
            id: task.id,
            updates: {
              status: task.status === 'done' ? 'pending' : 'done',
              completedAt: task.status === 'done' ? null : new Date().toISOString(),
            },
          })
        }}
        className={`mt-0.5 shrink-0 rounded cursor-pointer accent-primary ${compact ? 'w-3 h-3' : 'w-4 h-4'}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`break-words ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
          {task.title}
        </p>
        {task.threadId && (
          <p className="text-[10px] text-muted-foreground truncate">[{task.threadName}]</p>
        )}
        {task.source === 'manual' && !compact && (
          <p className="text-[10px] text-primary">manual</p>
        )}
      </div>
      {task.status === 'done' && <CheckCircle2 size={compact ? 10 : 12} className="text-primary shrink-0 mt-0.5" />}
    </div>
  )
}
