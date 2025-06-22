import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import { CategoryList } from './CategoryList'
import { arrayMove } from '@dnd-kit/sortable'
import { useState, useEffect, useMemo } from 'react'
import type { Category } from '../../../shared/schemas/category.schema'
import { getRandomIcon, getRandomColor } from '@/lib/categoryIcons'
import { addCategory } from '@/lib/crdts'

import { categoryService } from '@/services/categoryService'
import { useLiveCategories } from '@/hooks/useLiveCategories'

interface CategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoriesDialog({ open, onOpenChange }: CategoriesDialogProps) {
  const { categories: dbCategories } = useLiveCategories()
  const [localCategories, setLocalCategories] = useState<Category[]>([])
  const [isPendingUpdate, setIsPendingUpdate] = useState(false)
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null)

  // Initialize local state when database categories change
  useEffect(() => {
    if (!isPendingUpdate) {
      setLocalCategories(dbCategories)
    }
  }, [dbCategories, isPendingUpdate])

  // Use local categories for display
  const incomeCategories = useMemo(() =>
    localCategories.filter(cat => cat.type === 'income').sort((a, b) => a.order - b.order),
    [localCategories]
  )
  const expenseCategories = useMemo(() =>
    localCategories.filter(cat => cat.type === 'expense').sort((a, b) => a.order - b.order),
    [localCategories]
  )

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await categoryService.deleteCategory(categoryId)
    } catch (error) {
      console.error('Failed to delete category:', error)
    }
  }

  const handleAddCategory = async (type: 'income' | 'expense') => {
    const categoriesOfType = localCategories.filter(cat => cat.type === type)
    const maxOrder = categoriesOfType.length

    try {
      addCategory({
        name: 'New Category',
        type,
        icon: getRandomIcon(),
        color: getRandomColor(),
        order: maxOrder,
        isDefault: false
      })
    } catch (error) {
      console.error('Failed to create category:', error)
    }
    // if (!categoryService || !user?.userId) return
    //
    // const categoriesOfType = localCategories.filter(cat => cat.type === type)
    // const maxOrder = categoriesOfType.length
    //
    // try {
    //   const newCategory = await categoryService.createCategory({
    //     name: 'New Category',
    //     type,
    //     icon: getRandomIcon(),
    //     color: getRandomColor(),
    //     order: maxOrder,
    //     isDefault: false,
    //     userId: user.userId
    //   })
    //
    //   if (newCategory) {
    //     setNewCategoryId(newCategory._id)
    //   }
    // } catch (error) {
    //   console.error('Failed to create category:', error)
    // }
  }

  const handleReorder = async (activeId: string, overId: string, type: 'income' | 'expense') => {
    const categoriesList = type === 'income' ? incomeCategories : expenseCategories
    const oldIndex = categoriesList.findIndex(cat => cat._id === activeId)
    const newIndex = categoriesList.findIndex(cat => cat._id === overId)

    if (oldIndex !== -1 && newIndex !== -1) {
      // Optimistically update local state immediately
      setIsPendingUpdate(true)

      const reorderedCategories = arrayMove(categoriesList, oldIndex, newIndex)

      // Update the order property for reordered categories
      const updatedCategories = reorderedCategories.map((cat, index) => ({
        ...cat,
        order: index
      }))

      // Update local state immediately for instant visual feedback
      setLocalCategories(prevCategories => {
        const otherTypeCategories = prevCategories.filter(cat => cat.type !== type)
        return [...otherTypeCategories, ...updatedCategories]
      })

      // Update database in the background
      const updatePromises = updatedCategories.map((cat) =>
        categoryService.updateCategory(cat._id, { order: cat.order })
      )

      try {
        await Promise.all(updatePromises)
        // Allow database updates to sync after successful save
        setTimeout(() => setIsPendingUpdate(false), 100)
      } catch (error) {
        console.error('Failed to update category order:', error)
        // On error, revert to database state
        setIsPendingUpdate(false)
      }
    }
  }

  // if (isLoading) {
  //   return null
  // }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="pl-2">
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <ScrollArea className="mt-4 h-[60vh]">
          <div className="pr-4 pl-2 space-y-6">
            <CategoryList
              categories={incomeCategories}
              title="Income"
              onReorder={(activeId, overId) => handleReorder(activeId, overId, 'income')}
              onAddCategory={() => handleAddCategory('income')}
              onDeleteCategory={handleDeleteCategory}
              newCategoryId={newCategoryId}
              onClearNewCategoryId={() => setNewCategoryId(null)}
            />
            <CategoryList
              categories={expenseCategories}
              title="Expenses"
              onReorder={(activeId, overId) => handleReorder(activeId, overId, 'expense')}
              onAddCategory={() => handleAddCategory('expense')}
              onDeleteCategory={handleDeleteCategory}
              newCategoryId={newCategoryId}
              onClearNewCategoryId={() => setNewCategoryId(null)}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
