import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { useThreads } from '@/hooks/useThreads'
import { useCreateThread, useUpdateThread, useDeleteThread } from '@/hooks/useThreads'
import { useState } from 'react'

export default function ThreadsView() {
  const { data: threads = [], isLoading: threadsLoading, error: threadsError } = useThreads()
  const { 
    mutate: createThread, 
    isPending: isCreating,
    isError: isCreateError,
    error: createError
  } = useCreateThread()
  const { 
    mutate: updateThread, 
    isPending: isUpdating,
    isError: isUpdateError,
    error: updateError
  } = useUpdateThread()
  const { 
    mutate: deleteThread, 
    isPending: isDeleting,
    isError: isDeleteError,
    error: deleteError
  } = useDeleteThread()
  
  const [editThreadId, setEditThreadId] = useState<string | null>(null)
  const [editThreadName, setEditThreadName] = useState('')
  const [editThreadCategory, setEditThreadCategory] = useState('')
  const [editThreadFrequency, setEditThreadFrequency] = useState('')
  const [editThreadFixedDay, setEditThreadFixedDay] = useState<number | null>(null)
  const [editThreadStatus, setEditThreadStatus] = useState('')
  const [editThreadNotes, setEditThreadNotes] = useState('')
  
  const [selectedCategory, setSelectedCategory] = useState('All')
  
  const predefinedCategories = ['All', 'Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other']
  const extraCategories = Array.from(new Set(threads.map(t => t.category))).filter(c => !predefinedCategories.includes(c))
  const categories = [...predefinedCategories, ...extraCategories]

  const filteredThreads = threads.filter(t => {
    if (selectedCategory === 'All') return true
    return t.category === selectedCategory
  })
  
  const frequencyColors: Record<string, string> = {
    daily: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    weekly: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    multiple: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'fixed-day': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  }
  
  const handleSaveEdit = () => {
    if (!editThreadId) return
    
    const updates: Partial<any> = {
      name: editThreadName,
      category: editThreadCategory,
      frequency: editThreadFrequency,
      status: editThreadStatus,
      notes: editThreadNotes
    }
    
    // Only include fixedDay if it's a fixed-day thread
    if (editThreadFrequency === 'fixed-day') {
      updates.fixedDay = editThreadFixedDay
    } else {
      updates.fixedDay = null
    }
    
    updateThread({ id: editThreadId, updates })
    setEditThreadId(null)
  }
  
  const handleCancelEdit = () => {
    setEditThreadId(null)
    // Reset form values
    setEditThreadName('')
    setEditThreadCategory('')
    setEditThreadFrequency('')
    setEditThreadFixedDay(null)
    setEditThreadStatus('')
    setEditThreadNotes('')
  }
  
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Threads</h1>
            <p className="text-lg text-muted-foreground">Manage your active projects and roles</p>
          </div>
          <Button onClick={() => setEditThreadId('new')}>
            <Plus size={18} />New Thread
          </Button>
        </div>
        
        {/* Edit/Create Thread Modal */}
        {editThreadId !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">
                {editThreadId === 'new' ? 'Create New Thread' : 'Edit Thread'}
              </h2>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault()
                if (editThreadId === 'new') {
                  createThread({
                    name: editThreadName,
                    category: editThreadCategory,
                    frequency: editThreadFrequency,
                    fixedDay: editThreadFrequency === 'fixed-day' ? editThreadFixedDay : null,
                    status: editThreadStatus,
                    notes: editThreadNotes
                  })
                } else {
                  handleSaveEdit()
                }
              }}>
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={editThreadName}
                    onChange={(e) => setEditThreadName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={editThreadCategory}
                    onChange={(e) => setEditThreadCategory(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Select category</option>
                    <option value="Role/Program">Role/Program</option>
                    <option value="Active Build">Active Build</option>
                    <option value="Learning Track">Learning Track</option>
                    <option value="Application/Outreach">Application/Outreach</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Frequency</label>
                  <select
                    value={editThreadFrequency}
                    onChange={(e) => {
                      setEditThreadFrequency(e.target.value)
                      if (e.target.value !== 'fixed-day') {
                        setEditThreadFixedDay(null)
                      }
                    }}
                    required
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Select frequency</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="multiple">Multiple times/week</option>
                    <option value="fixed-day">Fixed day</option>
                  </select>
                </div>
                
                {editThreadFrequency === 'fixed-day' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Fixed Day</label>
                    <select
                      value={editThreadFixedDay ?? ''}
                      onChange={(e) => setEditThreadFixedDay(parseInt(e.target.value) || null)}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">Select day</option>
                      <option value="0">Monday</option>
                      <option value="1">Tuesday</option>
                      <option value="2">Wednesday</option>
                      <option value="3">Thursday</option>
                      <option value="4">Friday</option>
                      <option value="5">Saturday</option>
                      <option value="6">Sunday</option>
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={editThreadStatus}
                    onChange={(e) => setEditThreadStatus(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded"
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
                    value={editThreadNotes}
                    onChange={(e) => setEditThreadNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded"
                  />
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
                    disabled={isCreating || isUpdating || !(editThreadName && editThreadCategory && editThreadFrequency && editThreadStatus)}
                  >
                    {editThreadId === 'new' ? 'Create' : 'Save'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Category Filter */}
        {threadsLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading threads...</p>
          </div>
        ) : threadsError ? (
          <div className="text-center py-8">
            <p className="text-destructive">Error loading threads: {threadsError.message}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => {
                const count = cat === 'All' ? threads.length : threads.filter(t => t.category === cat).length
                return (
                  <Button
                    key={cat}
                    variant={cat === selectedCategory ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                    className="gap-1.5 transition-all"
                  >
                    <span>{cat}</span>
                    <span className={`text-xs px-1.5 py-0.2 rounded-full ${cat === selectedCategory ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                      {count}
                    </span>
                  </Button>
                )
              })}
            </div>
            
            {/* Threads Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredThreads.length === 0 ? (
                <div className="col-span-full py-12 text-center text-muted-foreground border rounded-lg border-dashed">
                  No threads found in category "{selectedCategory}".
                </div>
              ) : (
                filteredThreads.map((thread) => (
                <Card key={thread._id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{thread.name}</CardTitle>
                        <CardDescription>{thread.category}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {editThreadId === thread._id ? (
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
                              setEditThreadId(thread._id)
                              setEditThreadName(thread.name)
                              setEditThreadCategory(thread.category)
                              setEditThreadFrequency(thread.frequency)
                              setEditThreadFixedDay(thread.fixedDay ?? null)
                              setEditThreadStatus(thread.status)
                              setEditThreadNotes(thread.notes || '')
                            }}
                          >
                            <Edit2 size={16} />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            deleteThread(thread._id)
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <Badge className={frequencyColors[thread.frequency] || ''}>
                        {thread.frequency}
                      </Badge>
                      <Badge variant={thread.status === 'active' ? 'default' : 'outline'}>
                        {thread.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Appears {thread.frequency === 'daily' ? 'every day' : 
                       thread.frequency === 'weekly' ? 'once per week' : 
                       thread.frequency === 'multiple' ? 'multiple times per week' : 
                       thread.frequency === 'fixed-day' ? 'every ' + ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][thread.fixedDay || 0] : 
                       'unknown frequency'}
                    </p>
                  </CardContent>
                </Card>
              )))}
            </div>
          </>
        )}
        
        {/* Loading states for mutations */}
        {isCreating && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Creating thread...</p>
          </div>
        )}
        {isUpdating && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Updating thread...</p>
          </div>
        )}
        {isDeleting && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Deleting thread...</p>
          </div>
        )}
        
        {/* Error states for mutations */}
        {isCreateError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error creating thread: {createError?.message || 'Unknown error'}
            </p>
          </div>
        )}
        {isUpdateError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error updating thread: {updateError?.message || 'Unknown error'}
            </p>
          </div>
        )}
        {isDeleteError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error deleting thread: {deleteError?.message || 'Unknown error'}
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
