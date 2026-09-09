import { CheckCircle2, Trash2, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import React from 'react'

export interface TaskRowData {
  id: string
  title: string
  threadId: string | null
  threadName: string | null
  status: 'pending' | 'done' | string
  source?: string
  priority?: 'low' | 'medium' | 'high' | string
  intensity?: 'light' | 'medium' | 'heavy' | string
  dueDate?: string | null
}

interface TaskRowProps {
  task: TaskRowData
  onToggle: (task: TaskRowData) => void
  onDelete?: (task: TaskRowData) => void
  onEdit?: (task: TaskRowData) => void
  showSource?: boolean
  className?: string
}

export default function TaskRow({
  task,
  onToggle,
  onDelete,
  onEdit,
  showSource = false,
  className,
}: TaskRowProps) {
  const isDone = task.status === 'done'
  const dueCountdown = React.useMemo(() => {
    if (!task.dueDate) return null
    const due = new Date(task.dueDate)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: 'text-red-600', isOverdue: true }
    if (diffDays === 0) return { label: 'Due today', color: 'text-amber-600', isOverdue: false }
    if (diffDays === 1) return { label: 'Due tomorrow', color: 'text-amber-600', isOverdue: false }
    return { label: `${diffDays}d left`, color: 'text-muted-foreground', isOverdue: false }
  }, [task.dueDate])
  const isOverdue = dueCountdown?.isOverdue && !isDone
  return (
    <div
      className={cn(
        'group flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors',
        isOverdue && 'border border-red-500/40 bg-red-50 dark:bg-red-950/20',
        className
      )}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(task)}
        className="w-5 h-5 rounded cursor-pointer accent-primary shrink-0"
        aria-label={isDone ? 'Mark task as pending' : 'Mark task as done'}
      />
      <span
        className={cn(
          'flex-1 min-w-0 break-words text-sm',
          isDone && 'line-through text-muted-foreground'
        )}
      >
        {task.title}
      </span>
      {dueCountdown && (
        <span className={cn(
          'text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded',
          dueCountdown.isOverdue
            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
            : dueCountdown.color
        )}>
          {dueCountdown.label}
        </span>
      )}
      {task.threadId && (
        <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">
          [{task.threadName}]
        </span>
      )}
      {showSource && task.source === 'manual' && (
        <span className="text-[10px] text-primary font-medium shrink-0">manual</span>
      )}
      {task.priority && (
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            task.priority === 'high' ? 'bg-red-500' :
            task.priority === 'low' ? 'bg-slate-400' :
            'bg-amber-500'
          )}
          title={`Priority: ${task.priority}`}
        />
      )}
      {task.intensity && (
        <span
          className={cn(
            'text-[9px] font-bold uppercase tracking-wider shrink-0 px-1 py-0.5 rounded',
            task.intensity === 'heavy' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300' :
            task.intensity === 'light' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' :
            'bg-violet-500/15 text-violet-700 dark:text-violet-300'
          )}
          title={`Intensity: ${task.intensity}`}
        >
          {task.intensity}
        </span>
      )}
      {isDone && <CheckCircle2 size={16} className="text-primary shrink-0" />}
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(task)
          }}
          className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
          title="Edit task"
          aria-label="Edit task"
        >
          <Edit2 size={15} />
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task)
          }}
          className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
          title="Delete task"
          aria-label="Delete task"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}
