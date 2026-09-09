import { useParams, useNavigate, Link } from 'react-router-dom'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Markdown from '@/components/Markdown'
import { useThread, useThreadStats, useAddResource, useDeleteResource } from '@/hooks/useThread'
import { useTasks, useUpdateTask, useDeleteTask, useCreateTask } from '@/hooks/useTasks'
import { useUpdateThread } from '@/hooks/useThreads'
import {
  ArrowLeft, Edit2, Trash2, ExternalLink, Plus, Flame, BarChart3, Calendar, FileText, Link2, Save, X, Check
} from 'lucide-react'
import { useState, useEffect } from 'react'

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const frequencyColors: Record<string, string> = {
  daily: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  weekly: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  multiple: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'fixed-day': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

export default function ThreadDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: thread, isLoading, error } = useThread(id)
  const { data: stats } = useThreadStats(id)
  const { data: allTasks = [] } = useTasks({})
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: deleteTask } = useDeleteTask()
  const { mutate: createTask } = useCreateTask()
  const { mutate: updateThread, isPending: isUpdating } = useUpdateThread()
  const { mutate: addResource, isPending: isAddingResource } = useAddResource(id || '')
  const { mutate: deleteResource } = useDeleteResource(id || '')

  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaDraft, setMetaDraft] = useState({ name: '', category: '', frequency: '', fixedDay: 0, status: '', priority: 'medium', intensity: 'medium', taskType: 'discrete' as 'discrete' | 'continuous' })
  const [showAddResource, setShowAddResource] = useState(false)
  const [resourceDraft, setResourceDraft] = useState({ title: '', url: '', description: '', kind: 'link' as 'link' | 'resource' })

  useEffect(() => {
    if (thread) {
      setNotesDraft(thread.notes || '')
      setMetaDraft({
        name: thread.name,
        category: thread.category,
        frequency: thread.frequency,
        fixedDay: thread.fixedDay ?? 0,
        status: thread.status,
        priority: thread.priority,
        intensity: thread.intensity,
        taskType: (thread as any).taskType || 'discrete',
      })
    }
  }, [thread])

  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground">Loading thread…</p>
        </div>
      </MainLayout>
    )
  }

  if (error || !thread) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto space-y-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/threads')} className="gap-1">
            <ArrowLeft size={14} /> Back to Threads
          </Button>
          <p className="text-destructive">Thread not found.</p>
        </div>
      </MainLayout>
    )
  }

  const handleSaveNotes = () => {
    updateThread({ id: thread._id, updates: { notes: notesDraft } }, {
      onSuccess: () => setEditingNotes(false),
    })
  }

  const handleSaveMeta = () => {
    updateThread({
      id: thread._id,
      updates: {
        name: metaDraft.name,
        category: metaDraft.category,
        frequency: metaDraft.frequency,
        fixedDay: metaDraft.frequency === 'fixed-day' ? metaDraft.fixedDay : null,
        status: metaDraft.status,
        priority: metaDraft.priority as 'low' | 'medium' | 'high',
        intensity: metaDraft.intensity as 'light' | 'medium' | 'heavy',
        taskType: metaDraft.taskType,
      },
    }, {
      onSuccess: () => setEditingMeta(false),
    })
  }

  const handleAddResource = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resourceDraft.title.trim() || !resourceDraft.url.trim()) return
    addResource(resourceDraft, {
      onSuccess: () => {
        setResourceDraft({ title: '', url: '', description: '', kind: 'link' })
        setShowAddResource(false)
      },
    })
  }

  const isFixedDay = thread.frequency === 'fixed-day'

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/threads')} className="gap-1.5 shrink-0">
            <ArrowLeft size={14} /> Threads
          </Button>
        </div>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight break-words">
              {thread.name}
            </h1>
            <div className="flex gap-1.5 flex-wrap mt-2">
              <Badge className={`text-[10px] ${frequencyColors[thread.frequency]}`}>{thread.frequency}</Badge>
              <Badge variant={thread.status === 'active' ? 'default' : 'outline'} className="text-[10px]">{thread.status}</Badge>
              <Badge variant="outline" className="text-[10px]">{thread.category}</Badge>
              <Badge variant="outline" className={`text-[10px] ${
                thread.priority === 'high' ? 'border-red-500 text-red-700 dark:text-red-300' :
                thread.priority === 'low' ? 'border-slate-400 text-slate-600 dark:text-slate-400' :
                'border-amber-500 text-amber-700 dark:text-amber-300'
              }`}>{thread.priority} priority</Badge>
              <Badge variant="outline" className="text-[10px]">{thread.intensity} intensity</Badge>
              {isFixedDay && <Badge variant="outline" className="text-[10px]">Every {DAY_LABELS[thread.fixedDay ?? 0]}</Badge>}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditingMeta(true)} className="gap-1.5">
            <Edit2 size={14} /> Edit Details
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <BarChart3 size={14} /> This Quarter
                </div>
                <p className="text-2xl font-bold mt-1">{stats.tasksThisQuarter.rate}%</p>
                <p className="text-xs text-muted-foreground">{stats.tasksThisQuarter.completed}/{stats.tasksThisQuarter.total} done</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Check size={14} /> All-Time
                </div>
                <p className="text-2xl font-bold mt-1">{stats.tasksAllTime.completed}</p>
                <p className="text-xs text-muted-foreground">of {stats.tasksAllTime.total} tasks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Flame size={14} /> Streak
                </div>
                <p className="text-2xl font-bold mt-1">{stats.streakDays}</p>
                <p className="text-xs text-muted-foreground">consecutive days</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Calendar size={14} /> Last Active
                </div>
                <p className="text-base font-semibold mt-1">
                  {stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString() : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.lastActivity ? new Date(stats.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'no activity yet'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText size={18} /> Notes
              </CardTitle>
              <CardDescription className="text-xs">Markdown supported · **bold**, *italic*, `code`, [links](url), lists, headings</CardDescription>
            </div>
            {!editingNotes ? (
              <Button size="sm" variant="ghost" onClick={() => { setNotesDraft(thread.notes || ''); setEditingNotes(true) }} className="gap-1">
                <Edit2 size={14} /> Edit
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}><X size={14} /></Button>
                <Button size="sm" onClick={handleSaveNotes} disabled={isUpdating} className="gap-1">
                  <Save size={14} /> Save
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editingNotes ? (
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border rounded-md text-sm bg-background font-mono resize-y"
                placeholder="Write your notes here. Supports markdown."
              />
            ) : (
              <Markdown source={thread.notes || ''} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 size={18} /> Resources & Links
              </CardTitle>
              <CardDescription className="text-xs">Bookmarks, docs, repos, anything relevant to this thread</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAddResource(true)} className="gap-1">
              <Plus size={14} /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {(thread.resources || []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No resources yet. Add links or bookmarks to keep references handy.</p>
            ) : (
              <div className="space-y-2">
                {thread.resources.map((r) => (
                  <div key={r._id} className="group flex items-start gap-3 p-3 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors">
                    <div className="w-8 h-8 rounded bg-background flex items-center justify-center shrink-0">
                      {r.kind === 'resource' ? <FileText size={14} className="text-primary" /> : <Link2 size={14} className="text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1 break-all"
                      >
                        {r.title}
                        <ExternalLink size={12} className="shrink-0" />
                      </a>
                      <p className="text-xs text-muted-foreground break-all mt-0.5">{r.url}</p>
                      {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteResource(r._id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 h-8 w-8 p-0"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {stats && stats.upcomingTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar size={18} /> Upcoming Tasks
              </CardTitle>
              <CardDescription className="text-xs">Next 5 pending tasks for this thread</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {stats.upcomingTasks.map(t => (
                  <div key={t._id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-secondary/60">
                    <span className="text-sm flex-1 min-w-0 break-words">{t.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(t.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {t.timeBlock}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {thread && (() => {
          const queued = allTasks.filter(t => t.threadId === thread._id && t.timeBlock === 'unscheduled')
          if (queued.length === 0) return null
          const priorityOrder = { high:0, medium:1, low:2 }
          const sorted = [...queued].sort((a,b) => {
            const aDue = a.dueDate ? new Date(a.dueDate).getTime():Infinity
            const bDue = b.dueDate ? new Date(b.dueDate).getTime():Infinity
            if (aDue!==bDue) return aDue-bDue
            return (priorityOrder[a.priority]??1)-(priorityOrder[b.priority]??1)
          })
          return (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText size={18} /> Queued Tasks
                </CardTitle>
                <CardDescription className="text-xs">Manage unscheduled tasks for this thread</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sorted.map(t => (
                  <div key={t._id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40">
                    <span className="flex-1 truncate text-sm">{t.title}</span>
                    <span className="text-[10px] text-muted-foreground">{t.priority}/{t.intensity}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                      const newTitle = window.prompt('Edit title', t.title)
                      if (newTitle && newTitle.trim()) updateTask({ id: t._id, updates: { title: newTitle.trim() } })
                    }}><Edit2 size={12} /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm('Delete task?')) deleteTask(t._id) }}><Trash2 size={12} /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })()}

        {editingMeta && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg sm:text-xl font-bold mb-4">Edit Thread</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={metaDraft.name}
                    onChange={(e) => setMetaDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={metaDraft.category}
                    onChange={(e) => setMetaDraft(d => ({ ...d, category: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    {['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Frequency</label>
                  <select
                    value={metaDraft.frequency}
                    onChange={(e) => setMetaDraft(d => ({ ...d, frequency: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="multiple">Multiple/week</option>
                    <option value="fixed-day">Fixed day</option>
                  </select>
                </div>
                {metaDraft.frequency === 'fixed-day' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Fixed Day</label>
                    <select
                      value={metaDraft.fixedDay}
                      onChange={(e) => setMetaDraft(d => ({ ...d, fixedDay: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                    >
                      {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={metaDraft.status}
                    onChange={(e) => setMetaDraft(d => ({ ...d, status: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="parked">Parked/Idea</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Priority</label>
                    <select
                      value={metaDraft.priority}
                      onChange={(e) => setMetaDraft(d => ({ ...d, priority: e.target.value }))}
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
                      value={metaDraft.intensity}
                      onChange={(e) => setMetaDraft(d => ({ ...d, intensity: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                    >
                      <option value="light">Light</option>
                      <option value="medium">Medium</option>
                      <option value="heavy">Heavy</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Task Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="taskType" value="discrete" checked={metaDraft.taskType === 'discrete'} onChange={() => setMetaDraft(d => ({ ...d, taskType: 'discrete' }))} />
                      Discrete
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="taskType" value="continuous" checked={metaDraft.taskType === 'continuous'} onChange={() => setMetaDraft(d => ({ ...d, taskType: 'continuous' }))} />
                      Continuous
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingMeta(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveMeta} disabled={isUpdating} className="gap-1">
                  <Save size={14} /> Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {showAddResource && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg">
              <h2 className="text-lg font-bold mb-4">Add Resource</h2>
              <form onSubmit={handleAddResource} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    value={resourceDraft.title}
                    onChange={(e) => setResourceDraft(d => ({ ...d, title: e.target.value }))}
                    required
                    placeholder="e.g. AWS Builder Group docs"
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL</label>
                  <input
                    type="url"
                    value={resourceDraft.url}
                    onChange={(e) => setResourceDraft(d => ({ ...d, url: e.target.value }))}
                    required
                    placeholder="https://..."
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description (optional)</label>
                  <textarea
                    value={resourceDraft.description}
                    onChange={(e) => setResourceDraft(d => ({ ...d, description: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={resourceDraft.kind}
                    onChange={(e) => setResourceDraft(d => ({ ...d, kind: e.target.value as 'link' | 'resource' }))}
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  >
                    <option value="link">Link (URL bookmark)</option>
                    <option value="resource">Resource (doc/video/repo)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddResource(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={isAddingResource} className="gap-1">
                    <Plus size={14} /> Add Resource
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
