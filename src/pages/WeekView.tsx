import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format, startOfWeek, addDays, addWeeks, isSameWeek } from 'date-fns'
import { useQueries } from '@tanstack/react-query'
import { useWeek, useRegenerateWeek } from '@/hooks/useGrid'
import { useThreads } from '@/hooks/useThreads'
import { useUpdateTask } from '@/hooks/useTasks'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, CalendarDays, Plus } from 'lucide-react'
import QuickAddModal from '@/components/QuickAddModal'

export default function WeekView() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  
  const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 })
  const weekStartString = currentWeekStart.toISOString().split('T')[0] // YYYY-MM-DD
  
  // Task mutation & Week regeneration
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: regenerateWeek, isPending: isRegenerating } = useRegenerateWeek()
  
  // Fetch week data
  const { data: weekData = { week: [] }, isLoading: weekLoading, error: weekError } = useWeek(weekStartString)
  const tasks = weekData.week || []
  
  // Fetch all threads to get thread names
  const { data: threads = [], isLoading: threadsLoading, error: threadsError } = useThreads()
  
  // Navigation handlers
  const handlePrevWeek = () => setCurrentWeekStart(prev => addWeeks(prev, -1))
  const handleNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1))
  const handleCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  
  // Create a map of threadId -> thread name for easy lookup
  const threadMap = new Map(
    threads.map(thread => [thread._id, thread.name])
  )
  
  // Organize tasks by day and time block
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const timeBlocks = ['Morning', 'Afternoon', 'Evening']
  
  // Date strings for each day of the current week (YYYY-MM-DD)
  const dayStrings = days.map((_, dayIndex) => {
    const d = addDays(currentWeekStart, dayIndex)
    return format(d, 'yyyy-MM-dd')
  })

  // Create a 2D array: [dayIndex][timeBlockIndex] = tasks
  const tasksByDayAndBlock: any[][][] = Array.from({ length: 7 }, () => 
    Array.from({ length: 3 }, () => [] as any[])
  )
  
  // Populate the tasks array with timezone-safe matching
  tasks.forEach((task: any) => {
    const taskDateStr = String(task.date || '').split('T')[0]
    let dayIndex = dayStrings.indexOf(taskDateStr)
    
    if (dayIndex === -1 && task.date) {
      // Fallback matching
      const taskDate = new Date(task.date + 'T12:00:00')
      dayIndex = taskDate.getDay() === 0 ? 6 : taskDate.getDay() - 1
    }
    
    const normTimeBlock = (task.timeBlock || 'morning').toLowerCase()
    let timeBlockIndex = 0
    if (normTimeBlock === 'afternoon') timeBlockIndex = 1
    else if (normTimeBlock === 'evening') timeBlockIndex = 2
    
    if (dayIndex >= 0 && dayIndex < 7) {
      tasksByDayAndBlock[dayIndex][timeBlockIndex].push({
        id: task._id,
        title: task.title,
        threadId: task.threadId,
        threadName: task.threadId ? threadMap.get(task.threadId) || 'Unknown Thread' : null,
        status: task.status,
        source: task.source
      })
    }
  })
  
  // Fetch calendar events for each day in the week
  const calendarQueries = useQueries({
    queries: days.map((_, dayIndex) => {
      const dayDate = addDays(currentWeekStart, dayIndex)
      const dayDateStr = format(dayDate, 'yyyy-MM-dd')
      return {
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
      }
    }),
  })
  
  // Handle loading and error states gracefully
  const isLoading = (weekLoading && !tasks.length) || (threadsLoading && !threads.length)
  const hasError = weekError && !tasks.length
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">Week View</h1>
            <p className="text-sm text-muted-foreground">
              {format(currentWeekStart, 'MMM d')} — {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading week schedule...</p>
          </div>
        </div>
      </MainLayout>
    )
  }
  
  if (hasError) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">Week View</h1>
            <p className="text-sm text-muted-foreground">
              {format(currentWeekStart, 'MMM d')} — {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="text-center py-12">
            <p className="text-destructive">Error loading week data</p>
          </div>
        </div>
      </MainLayout>
    )
  }
  
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header with Navigation Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Week View</h1>
              {isCurrentWeek && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Current Week
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(currentWeekStart, 'MMMM d')} – {format(addDays(currentWeekStart, 6), 'MMMM d, yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Week navigation buttons */}
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-sm">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handlePrevWeek} 
                className="h-8 w-8 p-0" 
                title="Previous Week"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button 
                variant={isCurrentWeek ? "secondary" : "ghost"} 
                size="sm" 
                onClick={handleCurrentWeek} 
                className="h-8 text-xs font-medium px-3"
              >
                Today
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleNextWeek} 
                className="h-8 w-8 p-0" 
                title="Next Week"
              >
                <ChevronRight size={16} />
              </Button>
            </div>

            {/* Regenerate schedule */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => regenerateWeek(weekStartString)} 
              disabled={isRegenerating}
              className="gap-1.5 h-9 text-xs"
              title="Rebalance multi-frequency threads across this week"
            >
              <RefreshCw size={14} className={isRegenerating ? "animate-spin" : ""} />
              <span>{isRegenerating ? "Rebalancing..." : "Regenerate Week"}</span>
            </Button>

            {/* Quick Add */}
            <Button 
              size="sm" 
              onClick={() => setQuickAddOpen(true)}
              className="gap-1.5 h-9 text-xs"
            >
              <Plus size={14} />
              <span>Add Task</span>
            </Button>
          </div>
        </div>

        {/* Weekly Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          {days.map((day, dayIndex) => {
            const calendarEvents = (calendarQueries[dayIndex]?.data as any[]) || []
            const dayDate = addDays(currentWeekStart, dayIndex)
            const isToday = dayDate.toDateString() === new Date().toDateString()

            return (
              <Card key={day} className={`flex flex-col ${isToday ? 'ring-2 ring-primary/40' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{day}</CardTitle>
                    {isToday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-medium">
                        Today
                      </span>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {format(dayDate, 'MMM d')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4 pt-0">
                  {/* Time Blocks */}
                  <div className="space-y-2">
                    {timeBlocks.map((block, timeBlockIndex) => {
                      const blockTasks = tasksByDayAndBlock[dayIndex][timeBlockIndex];
                      return (
                        <div
                          key={`${day}-${block}`} 
                          className="p-2 rounded bg-secondary/50 hover:bg-secondary/80 transition-colors cursor-pointer"
                        >
                          <p className="font-semibold text-xs text-muted-foreground mb-1">{block}</p>
                          {blockTasks.length > 0 ? (
                            <>
                              {blockTasks.map((task: any, index: number) => (
                                <div
                                  key={`${day}-${block}-${index}`}
                                  className="flex items-center gap-2 p-1 rounded bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer mb-1"
                                >
                                  <input
                                    type="checkbox"
                                    checked={task.status === 'done'}
                                    onChange={() => {
                                      updateTask({
                                        id: task.id,
                                        updates: {
                                          status: task.status === 'done' ? 'pending' : 'done',
                                          completedAt: task.status === 'done' ? null : new Date().toISOString()
                                        }
                                      })
                                    }} 
                                    className="w-4 h-4 rounded cursor-pointer accent-primary"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className={task.status === 'done' ? 'line-through text-muted-foreground' : ''}>
                                      {task.title}
                                    </span>
                                    {task.threadId && (
                                      <span className="text-xs text-muted-foreground block">
                                        [{task.threadName}]
                                      </span>
                                    )}
                                    {task.source === 'manual' && (
                                      <span className="text-xs text-primary">(manual)</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No tasks...
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Calendar Events Section */}
                  <div className="mt-4">
                    <p className="font-semibold text-xs text-muted-foreground mb-1">Events</p>
                    {calendarEvents.length > 0 ? (
                      <>
                        {calendarEvents.map((event, index) => (
                          <div
                            key={`${day}-event-${index}`}
                            className="flex items-center gap-2 p-1 rounded bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer mb-1"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{event.title}</span>
                              {event.description && (
                                <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {new Date(event.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                                {new Date(event.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </p>
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No events...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button 
            onClick={() => setQuickAddOpen(true)}
            className="gap-2"
          >
            <Plus size={16} />
            <span>Create New Task</span>
          </Button>
          <Button 
            variant="outline" 
            onClick={() => regenerateWeek(weekStartString)}
            disabled={isRegenerating}
            className="gap-2"
          >
            <RefreshCw size={14} className={isRegenerating ? "animate-spin" : ""} />
            <span>{isRegenerating ? "Rebalancing..." : "Regenerate Week Schedule"}</span>
          </Button>
        </div>
      </div>

      <QuickAddModal 
        isOpen={quickAddOpen} 
        onClose={() => setQuickAddOpen(false)} 
      />
    </MainLayout>
  )
}