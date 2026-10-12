import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'

// In-app replacements for window.confirm / window.prompt. Call
// `await confirmDialog(...)` / `await promptDialog(...)` from anywhere;
// <DialogHost /> (mounted once in App) renders them.

type ConfirmRequest = {
  kind: 'confirm'
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  resolve: (ok: boolean) => void
}
type PromptRequest = {
  kind: 'prompt'
  title: string
  description?: string
  defaultValue?: string
  confirmLabel?: string
  resolve: (value: string | null) => void
}
type Request = ConfirmRequest | PromptRequest

let present: ((request: Request) => void) | null = null

export const confirmDialog = (options: Omit<ConfirmRequest, 'kind' | 'resolve'>) =>
  new Promise<boolean>(resolve => {
    if (!present) return resolve(false)
    present({ kind: 'confirm', ...options, resolve })
  })

export const promptDialog = (options: Omit<PromptRequest, 'kind' | 'resolve'>) =>
  new Promise<string | null>(resolve => {
    if (!present) return resolve(null)
    present({ kind: 'prompt', ...options, resolve })
  })

export default function DialogHost() {
  const [request, setRequest] = useState<Request | null>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    present = req => {
      setValue(req.kind === 'prompt' ? req.defaultValue ?? '' : '')
      setRequest(req)
    }
    return () => { present = null }
  }, [])

  const close = (result: boolean) => {
    if (!request) return
    if (request.kind === 'confirm') request.resolve(result)
    else request.resolve(result && value.trim() ? value.trim() : null)
    setRequest(null)
  }

  return (
    <Dialog.Root open={!!request} onOpenChange={open => { if (!open) close(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 shadow-xl"
        >
          <form onSubmit={e => { e.preventDefault(); close(true) }} className="space-y-4">
            <div className="space-y-1">
              <Dialog.Title className="text-base font-semibold">{request?.title}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground break-words">
                {request?.description ?? ''}
              </Dialog.Description>
            </div>
            {request?.kind === 'prompt' && (
              <input
                autoFocus
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" variant={request?.kind === 'confirm' && request.destructive ? 'destructive' : 'default'}>
                {request?.confirmLabel ?? (request?.kind === 'prompt' ? 'Save' : 'Confirm')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
