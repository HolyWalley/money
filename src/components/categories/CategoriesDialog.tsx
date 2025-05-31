import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDatabase } from '@/contexts/DatabaseContext'
import type { Category } from '../../../shared/schemas/category.schema'
import * as Icons from 'lucide-react'

interface CategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const colorClassMap = {
  red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200'
}

export function CategoriesDialog({ open, onOpenChange }: CategoriesDialogProps) {
  const { categoryService, isInitializing } = useDatabase()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadCategories() {
      if (categoryService && !isInitializing) {
        setLoading(true)
        try {
          const cats = await categoryService.getAllCategories()
          setCategories(cats)
        } catch (error) {
          console.error('Failed to load categories:', error)
        } finally {
          setLoading(false)
        }
      }
    }

    if (open) {
      loadCategories()
    }
  }, [open, categoryService, isInitializing])

  const incomeCategories = categories.filter(cat => cat.type === 'income')
  const expenseCategories = categories.filter(cat => cat.type === 'expense')

  const renderIcon = (iconName: string) => {
    const Icon = Icons[iconName as keyof typeof Icons] as React.FC<{ className?: string }>
    return Icon ? <Icon className="w-5 h-5" /> : null
  }

  const renderCategoryList = (categoryList: Category[], title: string) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="grid gap-2">
        {categoryList.map(category => (
          <div
            key={category._id}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
          >
            <div className={`p-2 rounded-lg ${colorClassMap[category.color]}`}>
              {renderIcon(category.icon)}
            </div>
            <span className="font-medium">{category.name}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {loading || isInitializing ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading categories...</div>
            </div>
          ) : (
            <>
              {renderCategoryList(incomeCategories, 'Income')}
              {renderCategoryList(expenseCategories, 'Expenses')}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
