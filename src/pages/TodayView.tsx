import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import MainLayout from '@/components/MainLayout'
import { Calendar, Clock, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useTasks, useUpdateTask, useCreateTask, useDeleteTask } from '@/hooks/useTasks'
import { useThreads } from '@/hooks/useThreads'
import { useCalendarEvents } from '@/hooks/useCalendar'
import { useState, useRef } from 'react'

export default function TodayView() {
  const today = new Date()
  const todayString = today.toISOString().split('T')[0] // YYYY-MM-DD format
  const quickInputRef = useRef<HTMLInputElement>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [selectedBlock, setSelectedBlock] = useState('morning')
  const [selectedThread, setSelectedThread] = useState<string>('')
  
  // Fetch tasks for today
  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } = useTasks({ 
    date: todayString 
  })
  
  // Task mutations
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask()
  const { mutate: deleteTask } = useDeleteTask()
  
  // Fetch all threads to get thread names
  const { data: threads = [], isLoading: threadsLoading, error: threadsError } = useThreads()
  
  // Fetch calendar events for today
  const { data: calendarEvents = [], isLoading: calendarLoading, error: calendarError } = useCalendarEvents(today)
  
  // Create a map of threadId -> thread name for easy lookup
  const threadMap = new Map(
    threads.map(thread => [thread._id, thread.name])
  )

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickTitle.trim()) return
    createTask({
      title: quickTitle.trim(),
      date: todayString,
      timeBlock: selectedBlock,
      threadId: selectedThread || null,
      status: 'pending',
      source: 'manual'
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
      source: 'google-calendar'
    } as any)
  }

  const isEventConverted = (eventTitle: string) => {
    return tasks.some(t => t.title === eventTitle && t.date === todayString)
  }
  
  // Group tasks by time block
  const timeBlocks = [
    { id: 'morning', label: 'Morning', time: '9:00 AM - 12:00 PM', icon: Calendar },
    { id: 'afternoon', label: 'Afternoon', time: '1:00 PM - 5:00 PM', icon: Clock },
    { id: 'evening', label: 'Evening', time: '6:00 PM - 9:00 PM', icon: Clock },
    { id: 'unscheduled', label: 'Unscheduled', time: 'Flexible', icon: Clock }
  ].map(block => ({ 
    ...block, 
    tasks: tasks
      .filter(task => (task.timeBlock || 'unscheduled') === block.id)
      .map(task => ({
        id: task._id,
        title: task.title,
        threadId: task.threadId,
        threadName: task.threadId ? threadMap.get(task.threadId) || 'Unknown Thread' : null,
        status: task.status
      })) 
  }))
  
  // Handle loading and error states gracefully
  const isLoading = (tasksLoading && !tasks.length) || (threadsLoading && !threads.length)
  const hasError = tasksError && !tasks.length && threadsError && !threads.length
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Today</h1>
            <p className="text-lg text-muted-foreground">{format(today, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </MainLayout>
    )
  }
  
  if (hasError) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Today</h1>
            <p className="text-lg text-muted-foreground">{format(today, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="text-center py-12">
            <p className="text-destructive">Error loading data</p>
          </div>
        </div>
      </MainLayout>
    )
  }
  
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">Today</h1>
          <p className="text-lg text-muted-foreground">{format(today, 'EEEE, MMMM d, yyyy')}</p>
        </div>

        {/* Quick Add Bar */}
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleQuickAdd} className="flex flex-wrap gap-2 items-center">
              <input
                ref={quickInputRef}
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Quick-add task for today..."
                className="flex-1 min-w-[200px] px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="px-3 py-2 border rounded-md text-sm bg-background max-w-[180px]"
              >
                <option value="">One-time (No Thread)</option>
                {threads.filter(t => t.status === 'active').map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={!quickTitle.trim() || isCreatingTask}>
                <Plus size={16} className="mr-1" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Time Blocks */}  
        {timeBlocks.map((block) => {
          const Icon = block.icon
          return (
            <Card key={block.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Icon className="text-primary" size={24} />
                  <div>
                    <CardTitle>{block.label}</CardTitle>
                    <CardDescription>{block.time}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {block.tasks.length > 0 ? (  
                  block.tasks.map((task) => ( 
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
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
                        className="w-5 h-5 rounded cursor-pointer accent-primary"
                      />
                      <span className={task.status === 'done' ? 'line-through text-muted-foreground flex-1' : 'flex-1'}>
                        {task.title}
                      </span>
                      {task.threadId && (
                        <span className="text-xs text-muted-foreground">
                          [{task.threadName}]
                        </span>
                      )}  
                      {task.status === 'done' && <CheckCircle2 size={18} className="text-primary" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteTask(task.id)
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive opacity-40 hover:opacity-100 transition-opacity"
                        title="Delete task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )) 
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No tasks scheduled for this time block</p>
                )} 
              </CardContent>
            </Card>
          )
        })}

        {/* Calendar Events Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              Today's Events
            </CardTitle>
            <CardDescription>Events synced from your Google Calendar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {calendarEvents.length > 0 ? (
              <>
                {calendarEvents.map((event: any, index: number) => {
                  const alreadyConverted = isEventConverted(event.title)
                  return (
                    <div
                      key={`event-${index}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/70 hover:bg-secondary transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{event.title}</span>
                          {alreadyConverted && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              <CheckCircle2 size={12} /> Scheduled
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{event.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(event.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} – 
                          {new Date(event.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>

                      {!alreadyConverted && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConvertCalendarEvent(event)}
                          className="text-xs h-8 gap-1.5 shrink-0"
                          title="Convert this calendar event into a checkable workspace task"
                        >
                          <Plus size={14} />
                          Add as Task
                        </Button>
                      )}
                    </div>
                  )
                })}
              </>
            ) : (
              <p className="text-center py-4 text-sm text-muted-foreground">
                No external calendar events scheduled for today.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Add Bottom Action */}
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