import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { ScrollArea } from '../ui/scroll-area'
import { CategoryList } from './CategoryList'

interface CategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoriesDialog({ open, onOpenChange }: CategoriesDialogProps) {
  const { categories, isLoading } = useLiveCategories()

  const incomeCategories = categories.filter(cat => cat.type === 'income')
  const expenseCategories = categories.filter(cat => cat.type === 'expense')

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
            <CategoryList categories={incomeCategories} title="Income" />
            <CategoryList categories={expenseCategories} title="Expenses" />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
