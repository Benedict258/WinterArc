import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast, type ToastProps } from './use-toast'

const SWIPE_DISMISS_PX = 80
const SWIPE_DISMISS_VELOCITY = 0.5 // px per ms

function ToastItem({ toast, onDismiss }: { toast: ToastProps; onDismiss: () => void }) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0)
  const [paused, setPaused] = useState(false)
  const drag = useRef<{ x: number; t: number; id: number } | null>(null)

  // Auto-dismiss, paused while hovered or being dragged
  useEffect(() => {
    if (paused || leaving) return
    const timer = setTimeout(() => setLeaving(1), toast.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [paused, leaving, toast.duration])

  // Let the slide-out finish before removing
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onDismiss, 180)
    return () => clearTimeout(timer)
  }, [leaving, onDismiss])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { x: e.clientX, t: performance.now(), id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setPaused(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) setDx(e.clientX - drag.current.x)
  }
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return
    const elapsed = Math.max(1, performance.now() - drag.current.t)
    const velocity = Math.abs(dx) / elapsed
    drag.current = null
    setPaused(false)
    if (Math.abs(dx) > SWIPE_DISMISS_PX || (Math.abs(dx) > 20 && velocity > SWIPE_DISMISS_VELOCITY)) {
      setLeaving(dx > 0 ? 1 : -1)
    } else {
      setDx(0)
    }
  }

  const offset = leaving ? leaving * 420 : dx
  const dragging = drag.current !== null

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => !drag.current && setPaused(false)}
      style={{
        transform: `translateX(${offset}px)`,
        opacity: leaving ? 0 : Math.max(0.2, 1 - Math.abs(dx) / 300),
        transition: dragging ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
        touchAction: 'pan-y',
      }}
      className={cn(
        'pointer-events-auto relative flex items-start gap-3 w-full rounded-lg border p-4 pr-10 shadow-lg select-none cursor-grab active:cursor-grabbing',
        toast.variant === 'destructive'
          ? 'bg-destructive text-destructive-foreground border-destructive'
          : 'bg-card text-card-foreground border-border'
      )}
    >
      <div className="min-w-0 flex-1">
        {toast.title && <div className="font-semibold text-sm break-words">{toast.title}</div>}
        {toast.description && <div className="text-xs opacity-90 mt-1 break-words">{toast.description}</div>}
        {toast.action && <div className="mt-2">{toast.action}</div>}
      </div>
      <button
        type="button"
        onClick={() => setLeaving(1)}
        className="absolute top-2 right-2 p-1.5 rounded-md opacity-60 hover:opacity-100 hover:bg-foreground/10 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed z-[100] bottom-4 left-4 right-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}
