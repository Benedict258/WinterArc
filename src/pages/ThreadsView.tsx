import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { useThreads, useCreateThread, useUpdateThread, useDeleteThread } from '@/hooks/useThreads'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PREDEFINED_CATEGORIES = ['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other']
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const frequencyColors: Record<string, string> = {
  daily: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  weekly: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  multiple: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'fixed-day': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

function frequencyDescription(thread: any): string {
  switch (thread.frequency) {
    case 'daily': return 'Every day'
    case 'weekly': return 'Once per week'
    case 'multiple': return 'Multiple times per week'
    case 'fixed-day': return `Every ${DAY_LABELS[thread.fixedDay ?? 0]}`
    default: return 'Unknown frequency'
  }
}

export default function ThreadsView() {
  const navigate = useNavigate()
  const { data: threads = [], isLoading, error } = useThreads()
  const { mutate: createThread, isPending: isCreating } = useCreateThread()
  const { mutate: updateThread, isPending: isUpdating } = useUpdateThread()
  const { mutate: deleteThread, isPending: isDeleting } = useDeleteThread()
  const { data: allTasks = [] } = useTasks({})
  const { mutate: createTask } = useCreateTask()
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: deleteTask } = useDeleteTask()

  const [selectedCategory, setSelectedCategory] = useState('All')
  const [editId, setEditId] = useState<string | null>(null)
  const [quickAddThreadId, setQuickAddThreadId] = useState<string | null>(null)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [quickAddDueDate, setQuickAddDueDate] = useState('')
  const [quickAddPriority, setQuickAddPriority] = useState<'low'|'medium'|'high'>('medium')
  const [quickAddIntensity, setQuickAddIntensity] = useState<'light'|'medium'|'heavy'>('medium')
  const [form, setForm] = useState({
    name: '',
    category: '',
    frequency: '',
    fixedDay: null as number | null,
    status: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    intensity: 'medium' as 'light' | 'medium' | 'heavy',
    notes: '',
    taskType: 'discrete' as 'discrete' | 'continuous',
  })

  const extraCategories = Array.from(new Set(threads.map(t => t.category))).filter(c => !PREDEFINED_CATEGORIES.includes(c))
  const categories = ['All', ...PREDEFINED_CATEGORIES, ...extraCategories]

  const filteredThreads = threads.filter(t => selectedCategory === 'All' || t.category === selectedCategory)

  const openNew = () => {
    setEditId('new')
    setForm({
      name: '', category: '', frequency: '', fixedDay: null, status: 'active',
      priority: 'medium', intensity: 'medium', notes: '', taskType: 'discrete',
    })
  }

  const openEdit = (thread: any) => {
    setEditId(thread._id)
    setForm({
      name: thread.name,
      category: thread.category,
      frequency: thread.frequency,
      fixedDay: thread.fixedDay ?? null,
      status: thread.status,
      priority: thread.priority || 'medium',
      intensity: thread.intensity || 'medium',
      notes: thread.notes || '',
      taskType: thread.taskType || 'discrete',
    })
  }

  const closeForm = () => setEditId(null)

  const handleSave = () => {
    if (!editId) return
    const payload: any = {
      name: form.name,
      category: form.category,
      frequency: form.frequency,
      fixedDay: form.frequency === 'fixed-day' ? form.fixedDay : null,
      status: form.status,
      priority: form.priority,
      intensity: form.intensity,
      notes: form.notes,
      taskType: form.taskType,
    }
    if (editId === 'new') {
      createThread(payload)
    } else {
      updateThread({ id: editId, updates: payload })
    }
    closeForm()
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Threads</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your active projects and roles</p>
          </div>
          <Button onClick={openNew} className="gap-1.5 self-start sm:self-auto">
            <Plus size={16} /> New Thread
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-sm text-muted-foreground">Loading threads...</p>
        ) : error ? (
          <p className="text-center py-8 text-sm text-destructive">Error loading threads</p>
        ) : (
          <>
            {/* Category filters */}
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => {
                const count = cat === 'All' ? threads.length : threads.filter(t => t.category === cat).length
                const active = cat === selectedCategory
                return (
                  <Button
                    key={cat}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                    className="gap-1.5 text-xs"
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                      {count}
                    </span>
                  </Button>
                )
              })}
            </div>

            {/* Threads grid */}
            {filteredThreads.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No threads in "{selectedCategory}".
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {filteredThreads.map(thread => (
                  <Card
                    key={thread._id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => navigate(`/threads/${thread._id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{thread.name}</CardTitle>
                          <CardDescription className="text-xs">{thread.category}</CardDescription>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); openEdit(thread) }} title="Edit">
                            <Edit2 size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm(`Archive "${thread.name}"?`)) deleteThread(thread._id)
                            }}
                            title="Archive"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <Badge className={`text-[10px] ${frequencyColors[thread.frequency] || ''}`}>{thread.frequency}</Badge>
                        <Badge variant={thread.status === 'active' ? 'default' : 'outline'} className="text-[10px]">{thread.status}</Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            thread.priority === 'high' ? 'border-red-500 text-red-700 dark:text-red-300' :
                            thread.priority === 'low' ? 'border-slate-400 text-slate-600 dark:text-slate-400' :
                            'border-amber-500 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {thread.priority || 'medium'} pri
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            thread.intensity === 'heavy' ? 'border-orange-500 text-orange-700 dark:text-orange-300' :
                            thread.intensity === 'light' ? 'border-sky-400 text-sky-700 dark:text-sky-300' :
                            'border-violet-400 text-violet-700 dark:text-violet-300'
                          }`}
                        >
                          {thread.intensity || 'medium'} int
                        </Badge>
                        {(() => {
                          const queued = allTasks.filter(t => t.threadId === thread._id && t.timeBlock === 'unscheduled')
                          const queueCount = queued.length
                          if (queueCount === 0) return null
                          const priorityOrder = { high: 0, medium: 1, low: 2 }
                          const sortedQueued = [...queued].sort((a, b) => {
                            const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
                            const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
                            if (aDue !== bDue) return aDue - bDue
                            const aPri = priorityOrder[a.priority] ?? 1
                            const bPri = priorityOrder[b.priority] ?? 1
                            return aPri - bPri
                          })
                          const firstWithDue = sortedQueued.find(t => t.dueDate)
                          let dueLabel = ''
                          let isOverdue = false
                          if (firstWithDue) {
                            const minDue = new Date(firstWithDue.dueDate)
                            const now = new Date()
                            const diffDays = Math.ceil((minDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                            if (diffDays < 0) {
                              dueLabel = ` • ${Math.abs(diffDays)}d overdue`
                              isOverdue = true
                            } else if (diffDays === 0) dueLabel = ` • Due today`
                            else if (diffDays <= 7) dueLabel = ` • ${diffDays}d left`
                          }
                          return (
                            <Badge variant={isOverdue ? 'destructive' : 'secondary'} className="text-[10px] ml-auto">{queueCount} queued{dueLabel}</Badge>
                          )
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground">{frequencyDescription(thread)}</p>
                      {thread.notes && (
                        <p className="text-xs text-muted-foreground italic break-words line-clamp-3">{thread.notes}</p>
                      )}
                        <div className="flex items-center justify-between pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation()
                              setQuickAddThreadId(thread._id)
                              setQuickAddTitle('')
                              setQuickAddDueDate('')
                              setQuickAddPriority('medium')
                              setQuickAddIntensity('medium')
                            }}
                          >
                            + Add task
                          </Button>
                         {thread.taskType === 'discrete' && (() => {
                           const queueCount = allTasks.filter(t => t.threadId === thread._id && t.timeBlock === 'unscheduled').length
                           return queueCount === 0 ? (
                             <p className="text-[11px] text-muted-foreground italic">No tasks queued — add one to see this thread in your week.</p>
                           ) : null
                         })()}
                       </div>
                       {(() => {
                         const queued = allTasks.filter(t => t.threadId === thread._id && t.timeBlock === 'unscheduled')
                         if (queued.length === 0) return null
                         const priorityOrder = { high:0, medium:1, low:2 }
                         const sorted = [...queued].sort((a,b)=> {
                           const aDue = a.dueDate ? new Date(a.dueDate).getTime():Infinity
                           const bDue = b.dueDate ? new Date(b.dueDate).getTime():Infinity
                           if (aDue!==bDue) return aDue-bDue
                           return (priorityOrder[a.priority]??1)-(priorityOrder[b.priority]??1)
                         })
                         return (
                             <div className="mt-3 pt-3 border-t space-y-1">
                             <p className="text-[11px] font-medium text-muted-foreground">Queued tasks</p>
                             {sorted.map(t => (
                               <div key={t._id} className="flex items-center gap-2 text-xs">
                                 <span className="flex-1 truncate">{t.title}</span>
                                 <span className="text-[10px] text-muted-foreground">{t.priority}/{t.intensity}</span>
                                 <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                   const next = t.priority==='low'?'medium':t.priority==='medium'?'high':t.priority
                                   updateTask({ id: t._id, updates: { priority: next } })
                                 }} title="Move up">↑</Button>
                                 <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                   const next = t.priority==='high'?'medium':t.priority==='medium'?'low':t.priority
                                   updateTask({ id: t._id, updates: { priority: next } })
                                 }} title="Move down">↓</Button>
                                 <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                   const newTitle = window.prompt('Edit task title', t.title)
                                   if (newTitle && newTitle.trim() !== t.title) {
                                     updateTask({ id: t._id, updates: { title: newTitle.trim() } })
                                   }
                                 }} title="Edit task"><Edit2 size={12} /></Button>
                                 <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => {
                                   if (window.confirm('Delete this task?')) {
                                     deleteTask(t._id)
                                   }
                                 }} title="Delete task"><Trash2 size={12} /></Button>
                               </div>
                             ))}
                           </div>
                         )
                       })()}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {(isCreating || isUpdating || isDeleting) && (
          <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-3 py-1.5 rounded shadow text-sm">
            {isCreating ? 'Creating thread...' : isUpdating ? 'Updating thread...' : 'Archiving...'}
          </div>
        )}
      </div>

      {editId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold mb-4">
              {editId === 'new' ? 'Create New Thread' : 'Edit Thread'}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleSave()
              }}
            >
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">Select category</option>
                  {PREDEFINED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm(f => ({ ...f, frequency: e.target.value, fixedDay: e.target.value === 'fixed-day' ? f.fixedDay : null }))}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">Select frequency</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="multiple">Multiple times/week</option>
                  <option value="fixed-day">Fixed day</option>
                </select>
              </div>

              {form.frequency === 'fixed-day' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Fixed Day</label>
                  <select
                    value={form.fixedDay ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, fixedDay: parseInt(e.target.value) || null }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="">Select day</option>
                    {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                >
                  <option value="">Select status</option>
                  <option value="active">Active</option>
                  <option value="parked">Parked/Idea</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm(f => ({ ...f, priority: e.target.value as 'low' | 'medium' | 'high' }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Intensity</label>
                  <select
                    value={form.intensity}
                    onChange={(e) => setForm(f => ({ ...f, intensity: e.target.value as 'light' | 'medium' | 'heavy' }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="light">Light (15m)</option>
                    <option value="medium">Medium (45m)</option>
                    <option value="heavy">Heavy (90m+)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Task Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="taskType" value="discrete" checked={form.taskType === 'discrete'} onChange={() => setForm(f => ({ ...f, taskType: 'discrete' }))} />
                    Discrete
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="taskType" value="continuous" checked={form.taskType === 'continuous'} onChange={() => setForm(f => ({ ...f, taskType: 'continuous' }))} />
                    Continuous
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={closeForm} variant="outline" size="sm" disabled={isCreating || isUpdating}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isCreating || isUpdating || !form.name || !form.category || !form.frequency || !form.status}>
                  {editId === 'new' ? 'Create' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {quickAddThreadId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg font-bold mb-4">Add Task to Thread</h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!quickAddTitle.trim()) return
                createTask({
                  title: quickAddTitle.trim(),
                  threadId: quickAddThreadId,
                  date: '',
                  dueDate: quickAddDueDate || null,
                  timeBlock: 'unscheduled',
                  status: 'pending',
                  source: 'manual',
                  priority: quickAddPriority,
                  intensity: quickAddIntensity,
                })
                setQuickAddThreadId(null)
                setQuickAddTitle('')
                setQuickAddDueDate('')
                setQuickAddPriority('medium')
                setQuickAddIntensity('medium')
              }}
            >
              <div>
                <label className="block text-sm font-medium mb-1">Task Title</label>
                <input
                  type="text"
                  autoFocus
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Due Date (optional)</label>
                <input
                  type="date"
                  value={quickAddDueDate}
                  onChange={(e) => setQuickAddDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select
                    value={quickAddPriority}
                    onChange={(e) => setQuickAddPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Intensity</label>
                  <select
                    value={quickAddIntensity}
                    onChange={(e) => setQuickAddIntensity(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="light">Light</option>
                    <option value="medium">Medium</option>
                    <option value="heavy">Heavy</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setQuickAddThreadId(null)} variant="outline" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!quickAddTitle.trim()}>
                  Create Task
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
