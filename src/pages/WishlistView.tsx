import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, CheckCircle2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWishlist } from '@/hooks/useWishlist'
import { useCreateWishlistItem, useUpdateWishlistItem, useDeleteWishlistItem } from '@/hooks/useWishlist'
import { useState } from 'react'

export default function WishlistView() {
  const { data: wishlist = [], isLoading: wishlistLoading, error: wishlistError } = useWishlist()
  const { 
    mutate: createItem, 
    isPending: isCreating,
    isError: isCreateError,
    error: createError
  } = useCreateWishlistItem()
  const { 
    mutate: updateItem, 
    isPending: isUpdating,
    isError: isUpdateError,
    error: updateError
  } = useUpdateWishlistItem()
  const { 
    mutate: deleteItem, 
    isPending: isDeleting,
    isError: isDeleteError,
    error: deleteError
  } = useDeleteWishlistItem()
  
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemNote, setEditItemNote] = useState('')
  const [editItemAcquired, setEditItemAcquired] = useState(false)
  
  const handleSaveEdit = () => {
    if (!editItemId) return
    
    const updates: Partial<any> = {
      item: editItemName,
      note: editItemNote,
      acquired: editItemAcquired
    }
    
    updateItem({ id: editItemId, updates })
    setEditItemId(null)
  }
  
  const handleCancelEdit = () => {
    setEditItemId(null)
    // Reset form values
    setEditItemName('')
    setEditItemNote('')
    setEditItemAcquired(false)
  }
  
  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Wishlist</h1>
            <p className="text-lg text-muted-foreground">Items to purchase when funds are available</p>
          </div>
          <Button onClick={() => setEditItemId('new')}>
            <Plus size={18} />Add Item
          </Button>
        </div>
        
        {/* Edit/Create Item Modal */}
        {editItemId !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">
                {editItemId === 'new' ? 'Create New Item' : 'Edit Item'}
              </h2>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault()
                if (editItemId === 'new') {
                  createItem({
                    item: editItemName,
                    note: editItemNote,
                    acquired: editItemAcquired
                  })
                } else {
                  handleSaveEdit()
                }
              }}>
                <div>
                  <label className="block text-sm font-medium mb-1">Item Name</label>
                  <input
                    type="text"
                    value={editItemName}
                    onChange={(e) => setEditItemName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Note (optional)</label>
                  <textarea
                    value={editItemNote}
                    onChange={(e) => setEditItemNote(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Acquired</label>
                  <input
                    type="checkbox"
                    checked={editItemAcquired}
                    onChange={(e) => setEditItemAcquired(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                </div>
                
                <div className="flex justify-end gap-3">
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
                    disabled={isCreating || isUpdating || !editItemName}
                  >
                    {editItemId === 'new' ? 'Create' : 'Save'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Loading state */}
        {wishlistLoading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading wishlist...</p>
          </div>
        )}
        
        {/* Error state */}
        {wishlistError && (
          <div className="text-center py-8">
            <p className="text-destructive">Error loading wishlist: {wishlistError.message}</p>
          </div>
        )}
        
        {/* Wishlist Items */}
        {!wishlistLoading && !wishlistError && (
          <div className="space-y-2">
            {wishlist.map((item: any) => (
              <Card
                key={item._id}
                className={`hover:bg-secondary/50 transition-colors ${
                  item.acquired ? 'opacity-60' : ''
                }`}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={item.acquired}
                      onChange={() => {
                        updateItem({
                          id: item._id,
                          updates: { acquired: !item.acquired }
                        })
                      }}
                      className="w-5 h-5 accent-primary cursor-pointer"
                    />
                    <div 
                      className="cursor-pointer"
                      onClick={() => {
                        updateItem({
                          id: item._id,
                          updates: { acquired: !item.acquired }
                        })
                      }}
                    >
                      <p className={`font-medium ${item.acquired ? 'line-through text-muted-foreground' : ''}`}>
                        {item.item}
                      </p>
                      {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
                    </div>
                  </div>
                  {editItemId === item._id ? (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleCancelEdit}
                    >
                      <Edit2 size={16} />
                    </Button>
                  ) : (
                    item.acquired ? <CheckCircle2 size={20} className="text-emerald-500" /> : null
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                    title="Delete item"
                    onClick={() => {
                      deleteItem(item._id)
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </CardContent>
              </Card>
            ))}
            
            {wishlist.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No wishlist items. Add some above!</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        
        {/* Loading states for mutations */}
        {isCreating && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Creating item...</p>
          </div>
        )}
        {isUpdating && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Updating item...</p>
          </div>
        )}
        {isDeleting && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-blue-500 text-white px-3 py-1 rounded">Deleting item...</p>
          </div>
        )}
        
        {/* Error states for mutations */}
        {isCreateError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error creating item: {createError?.message || 'Unknown error'}
            </p>
          </div>
        )}
        {isUpdateError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error updating item: {updateError?.message || 'Unknown error'}
            </p>
          </div>
        )}
        {isDeleteError && (
          <div className="fixed bottom-4 right-4">
            <p className="bg-destructive text-white px-3 py-1 rounded">
              Error deleting item: {deleteError?.message || 'Unknown error'}
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
