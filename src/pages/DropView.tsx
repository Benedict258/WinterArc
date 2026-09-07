import MainLayout from '@/components/MainLayout'
import { Button } from '@/components/ui/button'
import { useEffect, useState, useRef, useMemo } from 'react'
import { Upload, Link as LinkIcon, FileText, Download, Copy, Paperclip, MoreVertical } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

type DropItem = {
  _id: string
  type: 'file' | 'text' | 'link'
  fileName?: string | null
  fileSize?: number | null
  mimeType?: string | null
  textContent?: string | null
  createdAt: string
  expiresAt: string
}

const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/')

export default function DropView() {
  const { toast } = useToast()
  const [items, setItems] = useState<DropItem[]>([])
  const [textInput, setTextInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const [imgUrls, setImgUrls] = useState<Record<string,string>>({})
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/drop')
      if (res.ok) {
        const data = await res.json()
        setItems(prev => {
          const prevIds = new Set(prev.map(i => i._id))
          const newItems = data.filter((i: DropItem) => !prevIds.has(i._id))
          if (newItems.length) {
            // append only new items
            return [...prev, ...newItems]
          }
          // otherwise keep existing, but refresh if different length
          return data
        })
      }
    } catch {}
  }

  useEffect(() => {
    fetchItems()
    const interval = setInterval(fetchItems, 6000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const onVis = () => { if (!document.hidden) fetchItems() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [items.length])

  useEffect(() => {
    items.forEach(item => {
      if (item.type === 'file' && isImage(item.mimeType) && !imgUrls[item._id]) {
        fetch(`/api/drop/${item._id}/download-url`).then(r => r.json()).then(d => {
          if (d.downloadUrl) setImgUrls(prev => ({ ...prev, [item._id]: d.downloadUrl }))
        })
      }
    })
  }, [items])

  const uploadFile = async (file: File) => {
    try {
      const metaRes = await fetch('/api/drop/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size })
      })
      if (!metaRes.ok) throw new Error('Upload URL failed')
      const { uploadUrl, s3Key } = await metaRes.json()
      const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!putRes.ok) throw new Error('S3 upload failed')
      await fetch('/api/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'file', s3Key, fileName: file.name, fileSize: file.size, mimeType: file.type })
      })
      toast({ title: 'Dropped', description: file.name })
      fetchItems()
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' })
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(uploadFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const createTextItem = async () => {
    if (!textInput.trim()) return
    const isUrl = /^https?:\/\//.test(textInput.trim())
    await fetch('/api/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: isUrl ? 'link' : 'text', textContent: textInput.trim() })
    })
    setTextInput('')
    fetchItems()
  }

  const deleteItem = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await fetch(`/api/drop/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  const downloadItem = async (id: string, fileName?: string) => {
    const res = await fetch(`/api/drop/${id}/download-url`)
    if (!res.ok) return
    const { downloadUrl } = await res.json()
    // force download via blob
    try {
      const blobRes = await fetch(downloadUrl)
      const blob = await blobRes.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || 'download'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      window.open(downloadUrl, '_blank')
    }
  }

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast({ title: 'Copied' })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    if (format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return format(d, 'h:mm a')
    }
    return format(d, 'EEE h:mm a')
  }

  const daysLeft = (expiresAt: string) => {
    const d = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    return Math.max(0, d)
  }

  const sorted = useMemo(() => [...items].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [items])

  return (
    <MainLayout>
      <div className="h-[calc(100vh-2rem)] max-w-3xl mx-auto flex flex-col">
        <div className="mb-3">
          <h1 className="text-2xl font-bold">Drop</h1>
          <p className="text-sm text-muted-foreground">Your self-chat across devices</p>
        </div>

        <div
          ref={feedRef}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex-1 overflow-y-auto rounded-xl border bg-card p-4 space-y-3 ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          {sorted.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
              <Upload className="mb-2 opacity-50" />
              <p className="font-medium">No drops yet</p>
              <p className="text-sm">Drag a file here or type below to send it to your other devices.</p>
            </div>
          ) : (
            sorted.map((item, idx) => {
              const isImg = isImage(item.mimeType)
              const isAlt = idx % 2 === 1
              const bubbleBg = isAlt ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-background'
              return (
                <div key={item._id} className={`relative rounded-2xl border ${bubbleBg} p-3 shadow-sm max-w-[75%] ${isAlt ? 'self-end' : 'self-start'}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {item.type === 'text' && (
                        <p className="whitespace-pre-wrap break-words text-sm">{item.textContent}</p>
                      )}
                      {item.type === 'link' && (
                        <a href={item.textContent} target="_blank" rel="noreferrer" className="text-primary underline break-all text-sm">
                          {item.textContent}
                        </a>
                      )}
                      {item.type === 'file' && (
                        <div className="space-y-2">
                          {isImg ? (
                            imgUrls[item._id] ? (
                              <img src={imgUrls[item._id]} alt={item.fileName || ''} className="max-h-32 w-auto max-w-full rounded-lg border object-contain" />
                            ) : (
                              <div className="text-xs text-muted-foreground">Loading preview...</div>
                            )
                          ) : (
                            <div className="flex items-center gap-3 p-2 border rounded-lg">
                              <FileText className="opacity-70" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-sm">{item.fileName}</p>
                                <p className="text-xs text-muted-foreground">{item.fileSize ? `${(item.fileSize/1024).toFixed(1)} KB` : ''}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        <span>{formatTime(item.createdAt)}</span>
                      </div>
                    </div>
                    <button onClick={() => setMenuOpen(menuOpen === item._id ? null : item._id)} className="p-1 hover:bg-secondary rounded">
                      <MoreVertical size={14}/>
                    </button>
                  </div>
                  {menuOpen === item._id && (
                    <div className="absolute right-2 top-8 bg-popover border rounded-md shadow-md p-1 flex gap-1 z-10">
                      {item.type !== 'file' && item.textContent && (
                        <button onClick={() => { copyText(item.textContent!); setMenuOpen(null) }} className="p-1.5 hover:bg-secondary rounded" title="Copy"><Copy size={14}/></button>
                      )}
                      {item.type === 'file' && (
                        <button onClick={() => { downloadItem(item._id, item.fileName || undefined); setMenuOpen(null) }} className="p-1.5 hover:bg-secondary rounded" title="Download"><Download size={14}/></button>
                      )}
                      <button onClick={() => { deleteItem(item._id); setMenuOpen(null) }} className="p-1.5 hover:bg-secondary rounded text-destructive" title="Delete">✕</button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border bg-card p-2">
          <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-secondary rounded-lg"><Paperclip size={18}/></button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value='' }} />
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); createTextItem() } }}
            placeholder="Type a note or link, or drag files..."
            className="flex-1 bg-transparent outline-none px-2 py-2"
          />
          <Button size="sm" onClick={createTextItem}>Send</Button>
        </div>
      </div>
    </MainLayout>
  )
}
