import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Flame, TrendingUp, BarChart3, Trash2, Edit2, Plus, Target, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal } from '@/hooks/useGoals'
import { useAnalyticsSummary, useThreadAnalytics } from '@/hooks/useAnalytics'
import { useState } from 'react'

export default function GoalsView() {
  const { data: goals = [], isLoading: goalsLoading, error: goalsError } = useGoals()
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useAnalyticsSummary()
  const { data: threadAnalytics, isLoading: threadsAnalyticsLoading } = useThreadAnalytics()

  const { mutate: createGoal, isPending: isCreating } = useCreateGoal()
  const { mutate: updateGoal, isPending: isUpdating } = useUpdateGoal()
  const { mutate: deleteGoal } = useDeleteGoal()

  const [editGoalId, setEditGoalId] = useState<string | null>(null)
  const [editGoalPeriod, setEditGoalPeriod] = useState('')
  const [editGoalText, setEditGoalText] = useState('')

  const openNewGoal = () => {
    setEditGoalId('new')
    setEditGoalPeriod(currentQuarterLabel())
    setEditGoalText('')
  }

  const openEditGoal = (goal: any) => {
    setEditGoalId(goal._id)
    setEditGoalPeriod(goal.period)
    setEditGoalText(goal.text)
  }

  const handleSave = () => {
    if (!editGoalId) return
    if (editGoalId === 'new') {
      createGoal({ period: editGoalPeriod, text: editGoalText })
    } else {
      updateGoal({ id: editGoalId, updates: { period: editGoalPeriod, text: editGoalText } })
    }
    setEditGoalId(null)
  }

  const handleCancel = () => setEditGoalId(null)

  const threadRows = threadAnalytics?.threads ?? []
  const topThreads = threadRows.slice(0, 8)

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Goals & Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live workspace metrics for <span className="font-semibold text-foreground">{summary?.period ?? 'this quarter'}</span>
            </p>
          </div>
          <Button onClick={openNewGoal} className="gap-1.5 self-start sm:self-auto">
            <Plus size={16} /> Add Goal
          </Button>
        </div>

        {/* Live Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            loading={summaryLoading}
            error={summaryError}
            icon={<Flame size={20} />}
            iconBg="bg-orange-500/10 text-orange-500"
            label="Daily Streak"
            value={summary?.streak ?? 0}
            valueSuffix={summary?.streak === 1 ? 'day' : 'days'}
            subtitle="Consecutive days with completed work"
          />
          <MetricCard
            loading={summaryLoading}
            error={summaryError}
            icon={<TrendingUp size={20} />}
            iconBg="bg-emerald-500/10 text-emerald-500"
            label="Quarter Completion"
            value={summary ? `${summary.completionRate}%` : '—'}
            subtitle={summary ? `${summary.completed} done of ${summary.total} tasks` : 'Loading...'}
          />
          <MetricCard
            loading={summaryLoading}
            error={summaryError}
            icon={<BarChart3 size={20} />}
            iconBg="bg-blue-500/10 text-blue-500"
            label="Active Threads"
            value={summary?.activeThreads ?? 0}
            subtitle={summary ? `${summary.totalThreads} total registered` : 'Loading...'}
          />
        </div>

        {/* Per-Thread Live Performance */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target size={18} className="text-primary" />
                  Thread Performance
                </CardTitle>
                <CardDescription>
                  Real-time completion distribution by active project — {summary?.period ?? 'this quarter'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {threadsAnalyticsLoading ? (
              <p className="text-center text-sm text-muted-foreground py-6">Loading thread metrics...</p>
            ) : topThreads.length > 0 ? (
              <div className="space-y-3">
                {topThreads.map(thread => (
                  <ThreadBar key={thread._id} thread={thread} />
                ))}
                {threadRows.length > topThreads.length && (
                  <p className="text-xs text-center text-muted-foreground pt-1">
                    Showing top {topThreads.length} of {threadRows.length} threads
                  </p>
                )}
              </div>
            ) : (
              <p className="text-center py-6 text-sm text-muted-foreground">
                No active thread data available — generate this week's schedule to see metrics.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quarterly Goals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-primary" />
                  Quarterly & Seasonal Goals
                </CardTitle>
                <CardDescription>High-level strategic objectives for the quarter</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {goalsLoading ? (
              <p className="text-center text-sm text-muted-foreground py-6">Loading goals...</p>
            ) : goalsError ? (
              <p className="text-center text-sm text-destructive py-6">Error loading goals</p>
            ) : goals.length > 0 ? (
              <ul className="divide-y divide-border">
                {goals.map(goal => (
                  <li key={goal._id} className="py-3.5 flex items-start justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {goal.period}
                      </span>
                      <p className="text-sm leading-relaxed break-words">{goal.text}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditGoal(goal)}
                        title="Edit goal"
                      >
                        <Edit2 size={15} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteGoal(goal._id)}
                        title="Delete goal"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No quarterly goals defined yet.</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={openNewGoal}>
                  <Plus size={14} /> Add First Goal
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit/Create Goal Modal */}
      {editGoalId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg sm:text-xl font-bold mb-4">
              {editGoalId === 'new' ? 'Create New Goal' : 'Edit Goal'}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleSave()
              }}
            >
              <div>
                <label className="block text-sm font-medium mb-1">Period</label>
                <input
                  type="text"
                  value={editGoalPeriod}
                  onChange={(e) => setEditGoalPeriod(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  placeholder="e.g., Q4-2026"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Goal Objective</label>
                <textarea
                  value={editGoalText}
                  onChange={(e) => setEditGoalText(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
                  placeholder="What is your target milestone?"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={handleCancel} variant="outline" size="sm" disabled={isCreating || isUpdating}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isCreating || isUpdating || !editGoalPeriod || !editGoalText}>
                  {editGoalId === 'new' ? 'Create' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  )
}

function MetricCard({
  loading,
  error,
  icon,
  iconBg,
  label,
  value,
  valueSuffix,
  subtitle,
}: {
  loading: boolean
  error: any
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string | number
  valueSuffix?: string
  subtitle: string
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
        <div className={`shrink-0 p-2.5 rounded-full ${iconBg}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <div className="h-7 w-16 bg-secondary animate-pulse rounded mt-1" />
          ) : error ? (
            <p className="text-xs text-destructive mt-1">Unavailable</p>
          ) : (
            <p className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
              {value}
              {valueSuffix && (
                <span className="text-sm font-normal text-muted-foreground ml-1">{valueSuffix}</span>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ThreadBar({ thread }: { thread: any }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{thread.name}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">({thread.category})</span>
        </div>
        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {thread.completed}/{thread.total} {thread.total > 0 && `(${thread.rate}%)`}
        </span>
      </div>
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${thread.total > 0 ? thread.rate : 0}%` }}
        />
      </div>
    </div>
  )
}

function currentQuarterLabel() {
  const now = new Date()
  return `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`
}
