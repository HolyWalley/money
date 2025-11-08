import type { Category as CategoryType } from '../../../shared/schemas/category.schema'
import { Category } from './Category'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { Plus } from 'lucide-react'

interface CategoryListProps {
  categories: CategoryType[]
  allCategories: CategoryType[]
  title: string
  onReorder?: (activeId: string, overId: string) => void
  onAddCategory?: () => void
  onDeleteCategory?: (categoryId: string, newCategoryId?: string) => Promise<void>
  newCategoryId?: string | null
  onClearNewCategoryId?: () => void
}

export function CategoryList({ categories, allCategories, title, onReorder, onAddCategory, onDeleteCategory, newCategoryId, onClearNewCategoryId }: CategoryListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id && onReorder) {
      onReorder(active.id as string, over.id as string)
    }
  }

  const categoryIds = categories.map(cat => cat._id)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={categoryIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-2">
            {categories.map(category => (
              <Category
                key={category._id}
                category={category}
                allCategories={allCategories}
                startInEditMode={category._id === newCategoryId}
                onEditComplete={category._id === newCategoryId ? onClearNewCategoryId : undefined}
                onDelete={onDeleteCategory}
              />
            ))}
            {onAddCategory && (
              <button
                onClick={onAddCategory}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/50 transition-all text-muted-foreground hover:text-foreground hover:cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">Add Category</span>
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
