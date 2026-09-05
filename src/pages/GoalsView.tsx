import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Flame, TrendingUp, Trash2, Edit2, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGoals } from '@/hooks/useGoals'
import { useCreateGoal, useUpdateGoal, useDeleteGoal } from '@/hooks/useGoals'
import { useTasks } from '@/hooks/useTasks'
import { useThreads } from '@/hooks/useThreads'
import { useState } from 'react'

export default function GoalsView() {
  const { data: goals = [], isLoading: goalsLoading, error: goalsError } = useGoals()
  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: threads = [], isLoading: threadsLoading } = useThreads()

  const { 
    mutate: createGoal, 
    isPending: isCreating,
  } = useCreateGoal()
  const { 
    mutate: updateGoal, 
    isPending: isUpdating,
  } = useUpdateGoal()
  const { 
    mutate: deleteGoal, 
  } = useDeleteGoal()
  
  const [editGoalId, setEditGoalId] = useState<string | null>(null)
  const [editGoalPeriod, setEditGoalPeriod] = useState('')
  const [editGoalText, setEditGoalText] = useState('')
  
  // Real-time live analytics calculations
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === 'done').length
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  // Calculate live daily streak
  const completedDateStrings = Array.from(
    new Set(
      tasks
        .filter(t => t.status === 'done')
        .map(t => (t.completedAt || t.date || '').split('T')[0])
        .filter(Boolean)
    )
  ).sort().reverse()

  const todayStr = new Date().toISOString().split('T')[0]
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  
  let streak = 0
  let checkDate = new Date()
  if (!completedDateStrings.includes(todayStr) && completedDateStrings.includes(yesterdayStr)) {
    checkDate = new Date(Date.now() - 86400000)
  }

  for (let i = 0; i < 365; i++) {
    const curStr = checkDate.toISOString().split('T')[0]
    if (completedDateStrings.includes(curStr)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  const activeThreads = threads.filter(t => t.status === 'active')
  const activeThreadsCount = activeThreads.length

  // Live per-thread performance calculation
  const threadPerformance = activeThreads
    .map(thread => {
      const threadTasks = tasks.filter(t => t.threadId === thread._id)
      const threadCompleted = threadTasks.filter(t => t.status === 'done').length
      const total = threadTasks.length
      const rate = total > 0 ? Math.round((threadCompleted / total) * 100) : 0
      return {
        id: thread._id,
        name: thread.name,
        category: thread.category,
        completed: threadCompleted,
        total,
        rate
      }
    })
    .sort((a, b) => b.total - a.total)

  const handleSaveEdit = () => {
    if (!editGoalId) return
    
    const updates: Partial<any> = {
      period: editGoalPeriod,
      text: editGoalText
    }
    
    updateGoal({ id: editGoalId, updates })
    setEditGoalId(null)
  }
  
  const handleCancelEdit = () => {
    setEditGoalId(null)
    setEditGoalPeriod('')
    setEditGoalText('')
  }
  
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Goals & Analytics</h1>
            <p className="text-lg text-muted-foreground">Track your live workspace progress, execution metrics, and objectives</p>
          </div>
          <Button onClick={() => {
            setEditGoalId('new')
            setEditGoalPeriod('Q4-2026')
            setEditGoalText('')
          }} className="gap-1.5">
            <Plus size={16} /> Add Goal
          </Button>
        </div>
        
        {/* Edit/Create Goal Modal */}
        {editGoalId !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background border rounded-lg p-6 w-full max-w-md shadow-lg">
              <h2 className="text-xl font-bold mb-4">
                {editGoalId === 'new' ? 'Create New Goal' : 'Edit Goal'}
              </h2>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault()
                if (editGoalId === 'new') {
                  createGoal({
                    period: editGoalPeriod,
                    text: editGoalText
                  })
                } else {
                  handleSaveEdit()
                }
              }}>
                <div>
                  <label className="block text-sm font-medium mb-1">Period</label>
                  <input
                    type="text"
                    value={editGoalPeriod}
                    onChange={(e) => setEditGoalPeriod(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    placeholder="e.g., Q4-2026, September 2026"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Goal Objective</label>
                  <textarea
                    value={editGoalText}
                    onChange={(e) => setEditGoalText(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    rows={3}
                    placeholder="What is your target milestone?"
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-2">
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
                    disabled={isCreating || isUpdating || !(editGoalPeriod && editGoalText)}
                  >
                    {editGoalId === 'new' ? 'Create' : 'Save'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Loading state */}
        {goalsLoading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading workspace goals & metrics...</p>
          </div>
        )}
        
        {/* Error state */}
        {goalsError && (
          <div className="text-center py-8">
            <p className="text-destructive">Error loading goals: {goalsError.message}</p>
          </div>
        )}
        
        {/* Live Metrics Cards */}
        {!goalsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-full bg-orange-500/10 text-orange-500">
                  <Flame size={28} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Daily Streak</p>
                  <p className="text-3xl font-bold tracking-tight">
                    {streak} <span className="text-sm font-normal text-muted-foreground">day{streak === 1 ? '' : 's'}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500">
                  <TrendingUp size={28} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Task Completion</p>
                  <p className="text-3xl font-bold tracking-tight">
                    {completionRate}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {completedTasks} done of {totalTasks} total
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-500/10 text-blue-500">
                  <BarChart3 size={28} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Threads</p>
                  <p className="text-3xl font-bold tracking-tight">
                    {activeThreadsCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {threads.length} total registered
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Quarterly Goals */}
        {!goalsLoading && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Quarterly & Seasonal Goals</CardTitle>
                <CardDescription>High-level strategic objectives for this quarter</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {goals.length > 0 ? (
                <div className="divide-y divide-border">
                  {goals.map((goal) => (
                    <div key={goal._id} className="py-3.5 flex items-start justify-between gap-4 first:pt-1 last:pb-1">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {goal.period}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">{goal.text}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Edit goal"
                          onClick={() => {
                            setEditGoalId(goal._id)
                            setEditGoalPeriod(goal.period)
                            setEditGoalText(goal.text)
                          }}
                        >
                          <Edit2 size={15} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete goal"
                          onClick={() => {
                            deleteGoal(goal._id)
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No quarterly goals defined yet.</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3 gap-1.5"
                    onClick={() => {
                      setEditGoalId('new')
                      setEditGoalPeriod('Q4-2026')
                      setEditGoalText('')
                    }}
                  >
                    <Plus size={14} /> Add First Goal
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Per-Thread Live Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Live Thread Performance</CardTitle>
            <CardDescription>Real-time task completion distribution by active project and role</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {threadPerformance.length > 0 ? (
              threadPerformance.map((thread) => (
                <div key={thread.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{thread.name}</span>
                      <span className="text-xs text-muted-foreground">({thread.category})</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {thread.completed}/{thread.total} ({thread.rate}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${thread.total > 0 ? thread.rate : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-4 text-sm text-muted-foreground">
                No active thread data available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
