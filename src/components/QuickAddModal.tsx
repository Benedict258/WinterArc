import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateTask } from '@/hooks/useTasks'
import { useThreads } from '@/hooks/useThreads'

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function QuickAddModal({ isOpen, onClose }: QuickAddModalProps) {
  const todayString = new Date().toISOString().split('T')[0]
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayString)
  const [timeBlock, setTimeBlock] = useState('unscheduled')
  const [threadId, setThreadId] = useState<string>('')
  
  const { data: threads = [] } = useThreads()
  const { mutate: createTask, isPending } = useCreateTask()

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    createTask(
      {
        title: title.trim(),
        date: date || todayString,
        timeBlock: timeBlock,
        threadId: threadId || null,
        status: 'pending',
        source: 'manual',
      } as any,
      {
        onSuccess: () => {
          setTitle('')
          onClose()
        },
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Plus size={18} />
            </div>
            <h2 className="font-semibold text-base">Quick Add Task</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Task Title</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. ECAPs sensor calibration test..."
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-md text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Time Block</label>
              <select
                value={timeBlock}
                onChange={(e) => setTimeBlock(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-md text-sm bg-background"
              >
                <option value="unscheduled">Unscheduled</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Thread (Optional)</label>
            <select
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              className="w-full px-3 py-1.5 border rounded-md text-sm bg-background"
            >
              <option value="">None (One-time Task)</option>
              {threads
                .filter((t) => t.status === 'active')
                .map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} ({t.category})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || isPending}>
              {isPending ? 'Adding...' : 'Create Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
