import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { useThreads } from '@/hooks/useThreads'
import { useState } from 'react'

export default function BacklogView() {
  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } = useTasks({
    threadId: null,
  })

  const unscheduledTasks = tasks.filter((task: any) => !task.date)

  const { data: threads = [] } = useThreads()
  const threadMap = new Map(threads.map(t => [t._id, t.name]))

  const { mutate: createTask, isPending: isCreating } = useCreateTask()
  const { mutate: updateTask, isPending: isUpdating } = useUpdateTask()
  const { mutate: deleteTask } = useDeleteTask()

  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskThreadId, setEditTaskThreadId] = useState<string>('')
  const [editTaskTimeBlock, setEditTaskTimeBlock] = useState<'morning' | 'afternoon' | 'evening' | 'unscheduled'>('unscheduled')
  const [editTaskDueDate, setEditTaskDueDate] = useState('')

  const openNew = () => {
    setEditTaskId('new')
    setEditTaskTitle('')
    setEditTaskThreadId('')
    setEditTaskTimeBlock('unscheduled')
    setEditTaskDueDate('')
  }

  const openEdit = (task: any) => {
    setEditTaskId(task._id)
    setEditTaskTitle(task.title)
    setEditTaskThreadId(task.threadId ?? '')
    setEditTaskTimeBlock(task.timeBlock ?? 'unscheduled')
    setEditTaskDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
  }

  const handleSave = () => {
    if (!editTaskId) return
    if (editTaskId === 'new') {
      createTask({
        title: editTaskTitle,
        threadId: editTaskThreadId || null,
        timeBlock: editTaskTimeBlock,
        date: null,
        dueDate: editTaskDueDate || null,
        status: 'pending',
        source: 'manual',
      } as any)
    } else {
      updateTask({
        id: editTaskId,
        updates: {
          title: editTaskTitle,
          threadId: editTaskThreadId || null,
          timeBlock: editTaskTimeBlock,
          dueDate: editTaskDueDate || null,
        },
      })
    }
    setEditTaskId(null)
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Backlog</h1>
            <p className="text-sm text-muted-foreground mt-1">Unscheduled one-time tasks waiting to be assigned</p>
          </div>
          <Button onClick={openNew} className="gap-1.5 self-start sm:self-auto">
            <Plus size={16} /> Add Task
          </Button>
        </div>

        {tasksLoading ? (
          <p className="text-center py-8 text-sm text-muted-foreground">Loading backlog...</p>
        ) : tasksError ? (
          <p className="text-center py-8 text-sm text-destructive">Error loading backlog</p>
        ) : unscheduledTasks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No backlog items. Capture a one-time task with the + button.</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {unscheduledTasks.map((task: any) => (
              <li key={task._id}>
                <Card className="hover:bg-secondary/50 transition-colors">
                  <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        onChange={() => {
                          updateTask({
                            id: task._id,
                            updates: {
                              status: task.status === 'done' ? 'pending' : 'done',
                              completedAt: task.status === 'done' ? null : new Date().toISOString(),
                            },
                          })
                        }}
                        className="w-5 h-5 accent-primary shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium break-words ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                          {task.title}
                        </p>
                        {task.threadId && (
                          <p className="text-xs text-muted-foreground truncate">
                            Thread: {threadMap.get(task.threadId) || 'Unknown'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(task)} title="Edit task">
                        <Edit2 size={15} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (window.confirm('Delete this backlog task?')) deleteTask(task._id)
                        }}
                        title="Delete task"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {(isCreating || isUpdating) && (
          <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-3 py-1.5 rounded shadow text-sm">
            {isCreating ? 'Creating task...' : 'Updating task...'}
          </div>
        )}
      </div>

      {editTaskId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg sm:text-xl font-bold mb-4">
              {editTaskId === 'new' ? 'Create New Task' : 'Edit Task'}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleSave()
              }}
            >
              <div>
                <label className="block text-sm font-medium mb-1">Task Title</label>
                <input
                  type="text"
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Associated Thread (optional)</label>
                <select
                  value={editTaskThreadId}
                  onChange={(e) => setEditTaskThreadId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">No thread (personal task)</option>
                  {threads.filter(t => t.status !== 'archived').map(t => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Time Block</label>
                <select
                  value={editTaskTimeBlock}
                  onChange={(e) => setEditTaskTimeBlock(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="unscheduled">Unscheduled</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Due Date (optional)</label>
                <input
                  type="date"
                  value={editTaskDueDate}
                  onChange={(e) => setEditTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setEditTaskId(null)} variant="outline" size="sm" disabled={isCreating || isUpdating}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isCreating || isUpdating || !editTaskTitle}>
                  {editTaskId === 'new' ? 'Create' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
