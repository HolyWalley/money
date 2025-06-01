import { useState, useEffect } from 'react'
import * as Icons from 'lucide-react'
import type { Category as CategoryType } from '../../../shared/schemas/category.schema'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconColorSelector } from './IconColorSelector'
import { CategoryIcon } from './CategoryIcon'
import { useDatabase } from '@/contexts/DatabaseContext'
import type { CategoryColor } from '@/lib/categoryIcons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface CategoryProps {
  category: CategoryType
}

export function Category({ category }: CategoryProps) {
  const { categoryService } = useDatabase()
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(category.name)
  const [isIconPopoverOpen, setIsIconPopoverOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category._id,
    animateLayoutChanges: () => false,
  })

  // Keep editedName in sync with category.name when it changes
  useEffect(() => {
    setEditedName(category.name)
  }, [category.name])

  // Hide edit mode when we've saved and the category name matches what we saved
  useEffect(() => {
    if (isSaving && category.name === editedName.trim()) {
      setIsEditingName(false)
      setIsSaving(false)
    }
  }, [category.name, editedName, isSaving])

  const handleNameSave = async () => {
    if (editedName.trim() && editedName !== category.name && categoryService) {
      try {
        setIsSaving(true)
        await categoryService.updateCategory(category._id, { name: editedName.trim() })
        // Don't hide the input here - let the effect handle it when the prop updates
      } catch (error) {
        console.error('Failed to update category name:', error)
        setEditedName(category.name)
        setIsEditingName(false)
        setIsSaving(false)
      }
    } else {
      setEditedName(category.name)
      setIsEditingName(false)
    }
  }

  const handleIconChange = async (newIcon: string) => {
    if (categoryService) {
      try {
        await categoryService.updateCategory(category._id, { icon: newIcon })
        setIsIconPopoverOpen(false)
      } catch (error) {
        console.error('Failed to update category icon:', error)
      }
    }
  }

  const handleColorChange = async (newColor: CategoryColor) => {
    if (categoryService) {
      try {
        await categoryService.updateCategory(category._id, { color: newColor })
      } catch (error) {
        console.error('Failed to update category color:', error)
      }
    }
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
    >
      <div className="flex items-center gap-3 flex-1">
        <Popover modal open={isIconPopoverOpen} onOpenChange={setIsIconPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="cursor-pointer transition-all hover:scale-110"
              aria-label="Change icon and color"
            >
              <CategoryIcon icon={category.icon} color={category.color} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-4">
            <IconColorSelector
              currentIcon={category.icon}
              currentColor={category.color}
              onIconChange={handleIconChange}
              onColorChange={handleColorChange}
            />
          </PopoverContent>
        </Popover>

        {isEditingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleNameSave()
            }}
            className="flex items-center gap-2 flex-1"
          >
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              className="h-8"
              autoFocus
            />
            <Button type="submit" size="sm" variant="ghost">
              <Icons.Check className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
              onClick={() => {
                setEditedName(category.name)
                setIsEditingName(false)
              }}
            >
              <Icons.X className="w-4 h-4" />
            </Button>
          </form>
        ) : (
          <button
            onClick={() => {
              setEditedName(category.name)
              setIsEditingName(true)
            }}
            className="font-medium text-left hover:underline"
          >
            {category.name}
          </button>
        )}
      </div>
      <button
        className="cursor-grab active:cursor-grabbing p-2 hover:bg-accent rounded-md transition-colors touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <Icons.GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  )
}
