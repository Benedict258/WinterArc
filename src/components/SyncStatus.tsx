import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, RefreshCw } from 'lucide-react'
import { getQueue, processQueue, isOnline, QUEUE_CHANGED, QUEUE_FLUSHED } from '@/lib/syncQueue'

const RETRY_MS = 15_000

/**
 * Small pill shown while offline or while changes are waiting to sync.
 * Also retries the queue (navigator.onLine can say "online" with no real
 * internet, in which case the `online` event never fires) and refreshes the
 * screen's data once queued changes have reached the server.
 */
export default function SyncStatus() {
  const queryClient = useQueryClient()
  const [online, setOnline] = useState(isOnline())
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const refreshCount = () => getQueue().then(q => setPending(q.length))
    const flush = () => { processQueue().catch(console.error) }
    const onFlushed = () => queryClient.invalidateQueries()
    const onOnline = () => { setOnline(true); flush() }
    const onOffline = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }

    refreshCount()
    window.addEventListener(QUEUE_CHANGED, refreshCount)
    window.addEventListener(QUEUE_FLUSHED, onFlushed)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { getQueue().then(q => { if (q.length > 0) flush() }) }, RETRY_MS)
    return () => {
      window.removeEventListener(QUEUE_CHANGED, refreshCount)
      window.removeEventListener(QUEUE_FLUSHED, onFlushed)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [queryClient])

  if (online && pending === 0) return null

  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-lg md:bottom-4"
    >
      {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
      <span>
        {online ? 'Syncing' : 'Offline'}
        {pending > 0 && ` · ${pending} change${pending === 1 ? '' : 's'} pending`}
      </span>
    </div>
  )
}
