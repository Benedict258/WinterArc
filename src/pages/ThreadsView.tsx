import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { useThreads, useCreateThread, useUpdateThread, useDeleteThread } from '@/hooks/useThreads'
import { useState } from 'react'

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
  const { data: threads = [], isLoading, error } = useThreads()
  const { mutate: createThread, isPending: isCreating } = useCreateThread()
  const { mutate: updateThread, isPending: isUpdating } = useUpdateThread()
  const { mutate: deleteThread, isPending: isDeleting } = useDeleteThread()

  const [selectedCategory, setSelectedCategory] = useState('All')
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    category: '',
    frequency: '',
    fixedDay: null as number | null,
    status: '',
    notes: '',
  })

  const extraCategories = Array.from(new Set(threads.map(t => t.category))).filter(c => !PREDEFINED_CATEGORIES.includes(c))
  const categories = ['All', ...PREDEFINED_CATEGORIES, ...extraCategories]

  const filteredThreads = threads.filter(t => selectedCategory === 'All' || t.category === selectedCategory)

  const openNew = () => {
    setEditId('new')
    setForm({ name: '', category: '', frequency: '', fixedDay: null, status: 'active', notes: '' })
  }

  const openEdit = (thread: any) => {
    setEditId(thread._id)
    setForm({
      name: thread.name,
      category: thread.category,
      frequency: thread.frequency,
      fixedDay: thread.fixedDay ?? null,
      status: thread.status,
      notes: thread.notes || '',
    })
  }

  const closeForm = () => setEditId(null)

  const handleSave = () => {
    const payload: any = {
      name: form.name,
      category: form.category,
      frequency: form.frequency,
      fixedDay: form.frequency === 'fixed-day' ? form.fixedDay : null,
      status: form.status,
      notes: form.notes,
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
                  <Card key={thread._id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{thread.name}</CardTitle>
                          <CardDescription className="text-xs">{thread.category}</CardDescription>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(thread)} title="Edit">
                            <Edit2 size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
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
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge className={`text-[10px] ${frequencyColors[thread.frequency] || ''}`}>{thread.frequency}</Badge>
                        <Badge variant={thread.status === 'active' ? 'default' : 'outline'} className="text-[10px]">{thread.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{frequencyDescription(thread)}</p>
                      {thread.notes && (
                        <p className="text-xs text-muted-foreground italic break-words line-clamp-3">{thread.notes}</p>
                      )}
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
    </MainLayout>
  )
}
