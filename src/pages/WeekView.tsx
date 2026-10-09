import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format, startOfWeek, addDays, addWeeks, isSameWeek, isToday as fnsIsToday } from 'date-fns'
import { useQueries } from '@tanstack/react-query'
import { useWeek, useRebalanceWeek, useGridSettings, type ForecastTask } from '@/hooks/useGrid'
import { useThreads } from '@/hooks/useThreads'
import { useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, ChevronDown, Calendar as CalIcon, Maximize2, Minimize2, Sparkles, RefreshCw } from 'lucide-react'
import QuickAddModal from '@/components/QuickAddModal'
import TaskRow, { type TaskRowData } from '@/components/TaskRow'
import { cn, toDayKey, apiDayKey } from '@/lib/utils'

const INTENSITY_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 4 }
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const BLOCKS = [
  { id: 'morning', label: 'Morning', time: '9:00 AM – 12:00 PM' },
  { id: 'afternoon', label: 'Afternoon', time: '1:00 PM – 5:00 PM' },
  { id: 'evening', label: 'Evening', time: '6:00 PM – 9:00 PM' },
] as const

export default function WeekView() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() => {
    const todayStr = toDayKey()
    return { [todayStr]: true }
  })

  const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 })
  const weekStartString = toDayKey(currentWeekStart)

  const { mutate: updateTask } = useUpdateTask()
  const { mutate: deleteTask } = useDeleteTask()
  const { mutate: rebalanceWeek, isPending: isRebalancing } = useRebalanceWeek()
  const { data: gridBalancing } = useGridSettings()

  const { data: weekData, isLoading: weekLoading, error: weekError } = useWeek(weekStartString)
  const tasks = weekData?.week || []
  const forecast = weekData?.forecast || []
  const todayKey = toDayKey()

  const { data: threads = [], isLoading: threadsLoading } = useThreads()

  const threadMap = new Map(threads.map(thread => [thread._id, thread.name]))

  const dayStrings = useMemo(
    () =>
      Array.from({ length: 7 }, (_, dayIndex) =>
        format(addDays(currentWeekStart, dayIndex), 'yyyy-MM-dd')
      ),
    [currentWeekStart]
  )

  const tasksByDayAndBlock: Record<string, Record<string, TaskRowData[]>> = {}
  for (const ds of dayStrings) {
    tasksByDayAndBlock[ds] = { morning: [], afternoon: [], evening: [] }
  }

  tasks.forEach((task: any) => {
    const taskDateStr = apiDayKey(task.date) || ''
    const normBlock = (task.timeBlock || 'morning').toLowerCase()
    if (
      tasksByDayAndBlock[taskDateStr] &&
      (normBlock === 'morning' || normBlock === 'afternoon' || normBlock === 'evening')
    ) {
      tasksByDayAndBlock[taskDateStr][normBlock].push({
        id: task._id,
        title: task.title,
        threadId: task.threadId,
        threadName: task.threadId ? threadMap.get(task.threadId) || 'Unknown' : null,
        status: task.status,
        source: task.source,
        priority: task.priority,
        intensity: task.intensity,
        dueDate: task.dueDate || null,
      })
    }
  })

  const forecastByDayAndBlock: Record<string, Record<string, ForecastTask[]>> = {}
  for (const ds of dayStrings) {
    forecastByDayAndBlock[ds] = { morning: [], afternoon: [], evening: [] }
  }
  forecast.forEach(f => {
    forecastByDayAndBlock[f.date]?.[f.timeBlock]?.push(f)
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

  const toggleDay = (dayStr: string) => {
    setExpandedDays(prev => ({ ...prev, [dayStr]: !prev[dayStr] }))
  }

  const allExpanded = dayStrings.every(ds => expandedDays[ds])
  const expandAll = () => {
    const next: Record<string, boolean> = {}
    dayStrings.forEach(ds => (next[ds] = true))
    setExpandedDays(next)
  }
  const collapseAll = () => {
    setExpandedDays({})
  }

  const handleToggleTask = (task: TaskRowData) => {
    updateTask({
      id: task.id,
      updates: {
        status: task.status === 'done' ? 'pending' : 'done',
        completedAt: task.status === 'done' ? null : new Date().toISOString(),
      },
    })
  }

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

            {isCurrentWeek && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => rebalanceWeek()}
                disabled={isRebalancing}
                className="gap-1.5 h-9 text-xs"
                title="Re-plan this week with your current grid balancing and queues"
              >
                <RefreshCw size={14} className={isRebalancing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{isRebalancing ? 'Rebalancing…' : 'Rebalance week'}</span>
              </Button>
            )}

            <Button size="sm" onClick={() => setQuickAddOpen(true)} className="gap-1.5 h-9 text-xs">
              <Plus size={14} />
              <span>Add</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            variant="ghost"
            size="sm"
            onClick={allExpanded ? collapseAll : expandAll}
            className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
          >
            {allExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>

        <div className="space-y-3">
          {dayStrings.map((dayDateStr, dayIndex) => {
            const dayDate = addDays(currentWeekStart, dayIndex)
            const isToday = fnsIsToday(dayDate)
            const calendarEvents = (calendarQueries[dayIndex]?.data as any[]) || []
            const dayTotal = (Object.values(tasksByDayAndBlock[dayDateStr]) as TaskRowData[][]).reduce(
              (s, arr) => s + arr.length,
              0
            )
            const dayDone = (Object.values(tasksByDayAndBlock[dayDateStr]) as TaskRowData[][]).reduce(
              (s, arr) => s + arr.filter(t => t.status === 'done').length,
              0
            )
            const isExpanded = !!expandedDays[dayDateStr]
            const isForecastDay = dayDateStr > todayKey
            const dayForecastCount = (Object.values(forecastByDayAndBlock[dayDateStr]) as ForecastTask[][]).reduce(
              (s, arr) => s + arr.length,
              0
            )
            const dayLoad =
              (Object.values(tasksByDayAndBlock[dayDateStr]) as TaskRowData[][]).flat()
                .filter(t => t.status !== 'skipped')
                .reduce((s, t) => s + (INTENSITY_WEIGHT[t.intensity ?? 'medium'] ?? 2), 0) +
              (Object.values(forecastByDayAndBlock[dayDateStr]) as ForecastTask[][]).flat()
                .reduce((s, f) => s + (INTENSITY_WEIGHT[f.intensity] ?? 2), 0)
            const overCap = !!gridBalancing && dayLoad > gridBalancing.maxDailyIntensity

            return (
              <Card
                key={dayDateStr}
                className={cn(
                  'transition-colors',
                  isToday && 'ring-2 ring-primary/40',
                  !isExpanded && 'hover:bg-accent/30'
                )}
              >
                <CardHeader
                  className="cursor-pointer select-none pb-3"
                  onClick={() => toggleDay(dayDateStr)}
                  role="button"
                  aria-expanded={isExpanded}
                  aria-controls={`day-${dayDateStr}-content`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronDown
                        size={18}
                        className={cn(
                          'shrink-0 text-muted-foreground transition-transform duration-200',
                          !isExpanded && '-rotate-90'
                        )}
                      />
                      <div className="min-w-0">
                        <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2 flex-wrap">
                          {DAY_LABELS_FULL[dayIndex]}
                          {isToday && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-medium">
                              Today
                            </span>
                          )}
                          {isForecastDay && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium"
                              title="Not committed yet — updates as you add or finish tasks"
                            >
                              Forecast
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {format(dayDate, 'EEEE, MMMM d')}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {gridBalancing && dayLoad > 0 && (
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded',
                            overCap ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground'
                          )}
                          title="Day load (light 1, medium 2, heavy 4) vs. your Max Daily Intensity"
                        >
                          {dayLoad}/{gridBalancing.maxDailyIntensity}
                        </span>
                      )}
                      {dayTotal > 0 ? (
                        <span className="text-xs text-muted-foreground font-medium">
                          {dayDone}/{dayTotal} done
                          {dayForecastCount > 0 && ` · ${dayForecastCount} planned`}
                        </span>
                      ) : dayForecastCount > 0 ? (
                        <span className="text-xs text-muted-foreground">{dayForecastCount} planned</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No tasks</span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <div
                  id={`day-${dayDateStr}-content`}
                  className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-in-out',
                    isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  )}
                >
                  <div className="overflow-hidden">
                    <CardContent className="pt-0 space-y-4">
                      {BLOCKS.map(block => {
                        const blockTasks = tasksByDayAndBlock[dayDateStr][block.id]
                        const blockForecast = forecastByDayAndBlock[dayDateStr][block.id]
                        return (
                          <div key={block.id}>
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                              {block.label} <span className="font-normal normal-case">· {block.time}</span>
                            </p>
                            {blockTasks.length > 0 || blockForecast.length > 0 ? (
                              <div className="space-y-1.5">
                                {blockForecast.map((f, i) => (
                                  <div
                                    key={`fc-${dayDateStr}-${block.id}-${i}`}
                                    className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border border-dashed border-border text-muted-foreground"
                                    title="Forecast — committed when this day arrives"
                                  >
                                    <Sparkles size={14} className="shrink-0 opacity-60" />
                                    <span className="flex-1 min-w-0 break-words text-sm">{f.title}</span>
                                    {f.threadId && f.title !== threadMap.get(f.threadId) && (
                                      <span className="text-xs hidden sm:inline shrink-0">[{threadMap.get(f.threadId) || 'Unknown'}]</span>
                                    )}
                                    {f.kind === 'due' && <span className="text-[10px] font-medium shrink-0">due</span>}
                                  </div>
                                ))}
                                {blockTasks.map(task => (
                                  <TaskRow
                                    key={task.id}
                                    task={task}
                                    onToggle={handleToggleTask}
                                    onEdit={(t) => {
                                      const newTitle = window.prompt('Edit task title', t.title)
                                      if (newTitle && newTitle.trim() !== t.title) {
                                        updateTask({ id: t.id, updates: { title: newTitle.trim() } })
                                      }
                                    }}
                                    onDelete={(t) => deleteTask(t.id)}
                                    showSource
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground/70 px-1 pb-1">No tasks</p>
                            )}
                          </div>
                        )
                      })}

                      <div className="pt-2 border-t">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <CalIcon size={11} /> Events
                        </p>
                        {calendarEvents.length > 0 ? (
                          <div className="space-y-1.5">
                            {calendarEvents.map((event: any, idx: number) => (
                              <div
                                key={`${dayDateStr}-ev-${idx}`}
                                className="flex items-center gap-3 p-2.5 sm:p-3 rounded-lg bg-secondary/70"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm break-words">{event.title}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {' – '}
                                    {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/70 px-1 pb-1">No calendar events</p>
                        )}
                      </div>
                    </CardContent>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <QuickAddModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </MainLayout>
  )
}
