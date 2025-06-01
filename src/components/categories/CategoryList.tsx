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

interface CategoryListProps {
  categories: CategoryType[]
  title: string
  onReorder?: (activeId: string, overId: string) => void
}

export function CategoryList({ categories, title, onReorder }: CategoryListProps) {
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
      >
        <SortableContext
          items={categoryIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-2">
            {categories.map(category => (
              <Category key={category._id} category={category} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
