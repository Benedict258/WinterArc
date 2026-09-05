import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasks } from '@/hooks/useTasks'
import { useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { useState } from 'react'

export default function BacklogView() {
  // Fetch tasks with no threadId (unscheduled tasks) and no date
  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } = useTasks({
    threadId: null
  })
  
  // Filter to only include tasks with no date (truly unscheduled)
  const unscheduledTasks = tasks.filter(task => !task.date)
  
  const { 
    mutate: createTask, 
    isPending: isCreating,
    isError: isCreateError,
    error: createError
  } = useCreateTask()
  const { 
    mutate: updateTask, 
    isPending: isUpdating,
    isError: isUpdateError,
    error: updateError
  } = useUpdateTask()
  const { 
    mutate: deleteTask, 
    isPending: isDeleting,
    isError: isDeleteError,
    error: deleteError
  } = useDeleteTask()
  
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskThreadId, setEditTaskThreadId] = useState<string | null>(null)
  const [editTaskTimeBlock, setEditTaskTimeBlock] = useState<'morning' | 'afternoon' | 'evening' | 'unscheduled'>('unscheduled')
  
  const handleSaveEdit = () => {
    if (!editTaskId) return
    
    const updates: Partial<any> = {
      title: editTaskTitle,
      threadId: editTaskThreadId,
      timeBlock: editTaskTimeBlock
    }
    
    updateTask({ id: editTaskId, updates })
    setEditTaskId(null)
  }
  
  const handleCancelEdit = () => {
    setEditTaskId(null)
    // Reset form values
    setEditTaskTitle('')
    setEditTaskThreadId(null)
    setEditTaskTimeBlock('unscheduled')
  }
  
  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Backlog</h1>
            <p className="text-lg text-muted-foreground">Unscheduled tasks</p>
          </div>
          <Button onClick={() => setEditTaskId('new')}>
            <Plus size={18} />Add Task
          </Button>
        </div>
        
        {/* Edit/Create Task Modal */}
        {editTaskId !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">
                {editTaskId === 'new' ? 'Create New Task' : 'Edit Task'}
              </h2>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault()
                if (editTaskId === 'new') {
                  createTask({
                    title: editTaskTitle,
                    threadId: editTaskThreadId,
                    timeBlock: editTaskTimeBlock
                  })
                } else {
                  handleSaveEdit()
                }
              }}>
                <div>
                  <label className="block text-sm font-medium mb-1">Task Title</label>
                  <input
                    type="text"
                    value={editTaskTitle}
                    onChange={(e) => setEditTaskTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Associated Thread (optional)</label>
                  <select
                    value={editTaskThreadId ?? ''}
                    onChange={(e) => setEditTaskThreadId(e.target.value || null)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">No thread (personal task)</option>
                    {/* Thread options would be fetched from useThreads hook in a real implementation */}
                    {/* For now, we'll leave this as a simple select without options */}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Time Block</label>
                  <select
                    value={editTaskTimeBlock}
                    onChange={(e) => setEditTaskTimeBlock(e.target.value as any)}
                    required
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="unscheduled">Unscheduled</option>
                    <option value="morning">Morning (9AM-12PM)</option>
                    <option value="afternoon">Afternoon (1PM-5PM)</option>
                    <option value="evening">Evening (6PM-9PM)</option>
                  </select>
                </div>
                
                <div className="flex justify-end gap-3">
                  <Button 
                    type="button"
                    onClick={handleCancelEdit}
                    variant="outline"
                    disabled={isCreating || isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={isCreating || isUpdating || !editTaskTitle}
                  >
                    {editTaskId === 'new' ? 'Create' : 'Save'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Loading state */}
        {tasksLoading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading backlog...</p>
          </div>
        )}
        
        {/* Error state */}
        {tasksError && (
          <div className="text-center py-8">
            <p className="text-destructive">Error loading backlog: {tasksError.message}</p>
          </div>
        )}
        
        {/* Tasks List */}
        {!tasksLoading && !tasksError && (
          <div className="space-y-2">
            {unscheduledTasks.map((task) => (
              <Card key={task._id} className="hover:bg-secondary/50 transition-colors">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={task.status === 'done'}
                      onChange={() => {}}
                      className="w-5 h-5 accent-primary"
                    />
                    <div>
                      <p className="font-medium">{task.title}</p>
                      {task.threadId && (
                        <p className="text-sm text-muted-foreground">
                          Thread: {task.threadId} /* Would show thread name in full impl */
                        </p>
                      )}
                    </div>
                  </div>
                  {editTaskId === task._id ? (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleCancelEdit}
                    >
                      <Edit2 size={16} />
                    </Button>
                  ) : (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setEditTaskId(task._id)
                        setEditTaskTitle(task.title)
                        setEditTaskThreadId(task.threadId)
                        setEditTaskTimeBlock(task.timeBlock as any)
                      }}
                    >
                      <Edit2 size={16} />
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this task?')) {
                        deleteTask(task._id)
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </CardContent>
              </Card>
            ))}
            
            {unscheduledTasks.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No backlog items. Great job!</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        
        {/* Loading states for mutations */}
        {isCreating && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Creating task...</p>
          </div>
        )}
        {isUpdating && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Updating task...</p>
          </div>
        )}
        {isDeleting && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Deleting task...</p>
          </div>
        )}
        
        {/* Error states for mutations */}
        {isCreateError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error creating task: {createError?.message || 'Unknown error'}
            </p>
          </div>
        )}
        {isUpdateError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error updating task: {updateError?.message || 'Unknown error'}
            </p>
          </div>
        )}
        {isDeleteError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error deleting task: {deleteError?.message || 'Unknown error'}
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
