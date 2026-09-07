import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useEffect, useState, useRef } from 'react'
import { Upload, Link as LinkIcon, FileText, Trash2, Download, Copy, Clock } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

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

export default function DropView() {
  const { toast } = useToast()
  const [items, setItems] = useState<DropItem[]>([])
  const [textInput, setTextInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/drop')
      if (res.ok) setItems(await res.json())
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
      toast({ title: 'File dropped', description: file.name })
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
    toast({ title: 'Note added' })
    fetchItems()
  }

  const deleteItem = async (id: string) => {
    await fetch(`/api/drop/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  const downloadItem = async (id: string, fileName?: string) => {
    const res = await fetch(`/api/drop/${id}/download-url`)
    if (!res.ok) return
    const { downloadUrl } = await res.json()
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = fileName || 'download'
    a.click()
  }

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard' })
  }

  const daysLeft = (expiresAt: string) => {
    const d = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    return Math.max(0, d)
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Drop</h1>
          <p className="text-muted-foreground">Zero-friction capture. Files, text, links sync across devices.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Drop files or quick capture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto mb-2" />
              <p className="font-medium">Drag & drop files here</p>
              <p className="text-sm text-muted-foreground">or click to select • Max 100MB</p>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
            </div>

            <div className="flex gap-2">
              <input
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTextItem() }}
                placeholder="Quick text note or paste a link..."
                className="flex-1 px-3 py-2 rounded-lg border bg-background"
              />
              <Button onClick={createTextItem}>Add</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {items.map(item => (
            <Card key={item._id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.type === 'file' ? <Upload size={16}/> : item.type === 'link' ? <LinkIcon size={16}/> : <FileText size={16}/>}
                    <span className="font-medium truncate">{item.fileName || item.textContent?.slice(0, 60) || 'Untitled'}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary">{item.type}</span>
                  </div>
                  {item.type !== 'file' && (
                    <p className="text-sm text-muted-foreground truncate">{item.textContent}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Clock size={12}/> Expires in {daysLeft(item.expiresAt)} days
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {item.type === 'file' && (
                    <Button size="sm" variant="ghost" onClick={() => downloadItem(item._id, item.fileName || undefined)}> <Download size={14} /> </Button>
                  )}
                  {item.type !== 'file' && item.textContent && (
                    <Button size="sm" variant="ghost" onClick={() => copyText(item.textContent!)}> <Copy size={14} /> </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteItem(item._id)}> <Trash2 size={14} /> </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">No drops yet. Drop a file or add a note.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
