import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Category } from '../../../shared/schemas/category.schema'
import { CategoryIcon } from './CategoryIcon'

interface CategoryReassignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category
  availableCategories: Category[]
  transactionCount: number
  onConfirm: (newCategoryId: string) => void
}

export function CategoryReassignmentDialog({
  open,
  onOpenChange,
  category,
  availableCategories,
  transactionCount,
  onConfirm,
}: CategoryReassignmentDialogProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')

  useEffect(() => {
    if (availableCategories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(availableCategories[0]._id)
    }
  }, [availableCategories, selectedCategoryId])

  const handleConfirm = () => {
    if (selectedCategoryId) {
      onConfirm(selectedCategoryId)
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign Transactions</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              Category <span className="font-semibold">{category.name}</span> has{' '}
              <span className="font-semibold">{transactionCount}</span> transaction
              {transactionCount === 1 ? '' : 's'}.
            </p>
            <p>Please select a category to reassign them to before deletion:</p>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat._id} value={cat._id}>
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                      <span>{cat.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirm}
            disabled={!selectedCategoryId}
          >
            Reassign & Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
