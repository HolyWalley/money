import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { ScrollArea } from '../ui/scroll-area'
import { CategoryList } from './CategoryList'
import { useDatabase } from '@/contexts/DatabaseContext'
import { arrayMove } from '@dnd-kit/sortable'

interface CategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoriesDialog({ open, onOpenChange }: CategoriesDialogProps) {
  const { categories, isLoading } = useLiveCategories()
  const { categoryService } = useDatabase()

  const incomeCategories = categories.filter(cat => cat.type === 'income')
  const expenseCategories = categories.filter(cat => cat.type === 'expense')

  const handleReorder = async (activeId: string, overId: string, type: 'income' | 'expense') => {
    if (!categoryService) return

    const categoriesList = type === 'income' ? incomeCategories : expenseCategories
    const oldIndex = categoriesList.findIndex(cat => cat._id === activeId)
    const newIndex = categoriesList.findIndex(cat => cat._id === overId)

    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedCategories = arrayMove(categoriesList, oldIndex, newIndex)
      
      // Update order for all affected categories
      const updatePromises = reorderedCategories.map((cat, index) => 
        categoryService.updateCategory(cat._id, { order: index })
      )
      
      try {
        await Promise.all(updatePromises)
      } catch (error) {
        console.error('Failed to update category order:', error)
      }
    }
  }

  if (isLoading) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <ScrollArea className="mt-4 h-[60vh]">
          <div className="pr-4 space-y-6">
            <CategoryList 
              categories={incomeCategories} 
              title="Income" 
              onReorder={(activeId, overId) => handleReorder(activeId, overId, 'income')}
            />
            <CategoryList 
              categories={expenseCategories} 
              title="Expenses" 
              onReorder={(activeId, overId) => handleReorder(activeId, overId, 'expense')}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
