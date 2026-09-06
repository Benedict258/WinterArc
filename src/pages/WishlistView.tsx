import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, CheckCircle2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWishlist, useCreateWishlistItem, useUpdateWishlistItem, useDeleteWishlistItem } from '@/hooks/useWishlist'
import { useState } from 'react'

export default function WishlistView() {
  const { data: wishlist = [], isLoading, error } = useWishlist()
  const { mutate: createItem, isPending: isCreating } = useCreateWishlistItem()
  const { mutate: updateItem, isPending: isUpdating } = useUpdateWishlistItem()
  const { mutate: deleteItem } = useDeleteWishlistItem()

  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ item: '', note: '', acquired: false })

  const openNew = () => {
    setEditId('new')
    setForm({ item: '', note: '', acquired: false })
  }

  const openEdit = (item: any) => {
    setEditId(item._id)
    setForm({ item: item.item, note: item.note || '', acquired: !!item.acquired })
  }

  const handleSave = () => {
    if (!editId) return
    if (editId === 'new') {
      createItem({ item: form.item, note: form.note, acquired: form.acquired })
    } else {
      updateItem({ id: editId, updates: { item: form.item, note: form.note, acquired: form.acquired } })
    }
    setEditId(null)
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Wishlist</h1>
            <p className="text-sm text-muted-foreground mt-1">Items to purchase when funds are available</p>
          </div>
          <Button onClick={openNew} className="gap-1.5 self-start sm:self-auto">
            <Plus size={16} /> Add Item
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-sm text-muted-foreground">Loading wishlist...</p>
        ) : error ? (
          <p className="text-center py-8 text-sm text-destructive">Error loading wishlist</p>
        ) : wishlist.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No wishlist items yet. Add some above.</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {wishlist.map((item: any) => (
              <li key={item._id}>
                <Card className={`hover:bg-secondary/50 transition-colors ${item.acquired ? 'opacity-60' : ''}`}>
                  <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={!!item.acquired}
                        onChange={() =>
                          updateItem({ id: item._id, updates: { acquired: !item.acquired } })
                        }
                        className="w-5 h-5 accent-primary cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium break-words ${item.acquired ? 'line-through text-muted-foreground' : ''}`}>
                          {item.item}
                        </p>
                        {item.note && <p className="text-xs text-muted-foreground break-words line-clamp-2">{item.note}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.acquired && <CheckCircle2 size={16} className="text-emerald-500" />}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(item)} title="Edit item">
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteItem(item._id)}
                        title="Delete item"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {(isCreating || isUpdating) && (
          <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-3 py-1.5 rounded shadow text-sm">
            {isCreating ? 'Adding item...' : 'Saving...'}
          </div>
        )}
      </div>

      {editId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-lg p-5 sm:p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg sm:text-xl font-bold mb-4">
              {editId === 'new' ? 'Add Wishlist Item' : 'Edit Item'}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleSave()
              }}
            >
              <div>
                <label className="block text-sm font-medium mb-1">Item Name</label>
                <input
                  type="text"
                  value={form.item}
                  onChange={(e) => setForm(f => ({ ...f, item: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Note (optional)</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="acquired"
                  checked={form.acquired}
                  onChange={(e) => setForm(f => ({ ...f, acquired: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="acquired" className="text-sm font-medium cursor-pointer">
                  Already acquired
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setEditId(null)} variant="outline" size="sm" disabled={isCreating || isUpdating}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isCreating || isUpdating || !form.item}>
                  {editId === 'new' ? 'Add' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  )
}
