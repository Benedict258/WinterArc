import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import MainLayout from '@/components/MainLayout'
import TaskRow, { type TaskRowData } from '@/components/TaskRow'
import { Calendar, Clock, CheckCircle2, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { useTasks, useUpdateTask, useCreateTask, useDeleteTask } from '@/hooks/useTasks'
import { useThreads } from '@/hooks/useThreads'
import { useCalendarEvents } from '@/hooks/useCalendar'
import { useState, useRef } from 'react'

export default function TodayView() {
  const today = new Date()
  const todayString = today.toISOString().split('T')[0]
  const quickInputRef = useRef<HTMLInputElement>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [selectedBlock, setSelectedBlock] = useState('morning')
  const [selectedThread, setSelectedThread] = useState<string>('')

  const { data: tasks = [], isLoading: tasksLoading } = useTasks({ date: todayString })
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask()
  const { mutate: deleteTask } = useDeleteTask()

  const { data: threads = [] } = useThreads()
  const { data: calendarEvents = [] } = useCalendarEvents(today)

  const threadMap = new Map(threads.map(t => [t._id, t.name]))

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickTitle.trim()) return
    createTask({
      title: quickTitle.trim(),
      date: todayString,
      timeBlock: selectedBlock,
      threadId: selectedThread || null,
      status: 'pending',
      source: 'manual',
    } as any)
    setQuickTitle('')
  }

  const handleConvertCalendarEvent = (event: any) => {
    const startDate = new Date(event.start)
    const hour = startDate.getHours()
    let timeBlock = 'afternoon'
    if (hour < 12) timeBlock = 'morning'
    else if (hour >= 18) timeBlock = 'evening'

    createTask({
      title: event.title,
      date: todayString,
      timeBlock,
      threadId: null,
      status: 'pending',
      source: 'google-calendar',
    } as any)
  }

  const isEventConverted = (eventTitle: string) => {
    return tasks.some((t: any) => t.title === eventTitle && t.date === todayString)
  }

  const timeBlocks = [
    { id: 'morning', label: 'Morning', time: '9:00 AM – 12:00 PM', icon: Calendar },
    { id: 'afternoon', label: 'Afternoon', time: '1:00 PM – 5:00 PM', icon: Clock },
    { id: 'evening', label: 'Evening', time: '6:00 PM – 9:00 PM', icon: Clock },
    { id: 'unscheduled', label: 'Unscheduled', time: 'Flexible', icon: Clock },
  ].map(block => ({
    ...block,
    tasks: tasks
      .filter((task: any) => (task.timeBlock || 'unscheduled') === block.id)
      .map((task: any) => ({
        id: task._id,
        title: task.title,
        threadId: task.threadId,
        threadName: task.threadId ? threadMap.get(task.threadId) || 'Unknown' : null,
        status: task.status,
        priority: task.priority,
        intensity: task.intensity,
      })),
  }))

  if (tasksLoading && tasks.length === 0) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto space-y-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Today</h1>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Today</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">{format(today, 'EEEE, MMMM d, yyyy')}</p>
        </div>

        {/* Quick Add Bar */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <form onSubmit={handleQuickAdd} className="flex flex-wrap gap-2 items-center">
              <input
                ref={quickInputRef}
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Quick-add task for today..."
                className="flex-1 min-w-[180px] px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm bg-background"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="unscheduled">Unscheduled</option>
              </select>
              <select
                value={selectedThread}
                onChange={(e) => setSelectedThread(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm bg-background max-w-[200px]"
              >
                <option value="">One-time</option>
                {threads.filter(t => t.status === 'active').map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={!quickTitle.trim() || isCreatingTask} className="gap-1">
                <Plus size={14} className="sm:mr-0.5" /> <span className="hidden sm:inline">Add</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Time Blocks */}
        {timeBlocks.map((block) => {
          const Icon = block.icon
          return (
            <Card key={block.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Icon className="text-primary shrink-0" size={20} />
                  <div className="min-w-0">
                    <CardTitle className="text-base">{block.label}</CardTitle>
                    <CardDescription className="text-xs">{block.time}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {block.tasks.length > 0 ? (
                  block.tasks.map((task: TaskRowData) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggle={(t) => {
                        updateTask({
                          id: t.id,
                          updates: {
                            status: t.status === 'done' ? 'pending' : 'done',
                            completedAt: t.status === 'done' ? null : new Date().toISOString(),
                          },
                        })
                      }}
                      onDelete={(t) => deleteTask(t.id)}
                      showSource
                    />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No tasks scheduled for this time block</p>
                )}
              </CardContent>
            </Card>
          )
        })}

        {/* Calendar Events Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar size={18} />
              Today's Events
            </CardTitle>
            <CardDescription className="text-xs">Events synced from your Google Calendar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {calendarEvents.length > 0 ? (
              calendarEvents.map((event: any, index: number) => {
                const alreadyConverted = isEventConverted(event.title)
                return (
                  <div key={`event-${index}`} className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-lg bg-secondary/70 hover:bg-secondary transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm break-words">{event.title}</span>
                        {alreadyConverted && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            <CheckCircle2 size={10} /> Scheduled
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{event.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {!alreadyConverted && (
                      <Button size="sm" variant="outline" onClick={() => handleConvertCalendarEvent(event)} className="text-xs h-8 gap-1 shrink-0">
                        <Plus size={12} /> Add as Task
                      </Button>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-center py-4 text-sm text-muted-foreground">No external calendar events scheduled for today.</p>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full gap-2"
          size="lg"
          onClick={() => {
            quickInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            quickInputRef.current?.focus()
          }}
        >
          <Plus size={18} />
          Add Task for Today
        </Button>
      </div>
    </MainLayout>
  )
}
