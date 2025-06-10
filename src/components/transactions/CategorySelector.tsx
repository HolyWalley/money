import { useState, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { categoryIconsMap } from '@/lib/categoryIconsMap'
import type { Category } from '../../../shared/schemas/category.schema'

interface CategorySelectorProps {
  categories: Category[]
  selectedCategoryId?: string
  onCategorySelect: (categoryId: string) => void
  disabled?: boolean
}

const colorClasses = {
  red: 'bg-transparent !text-red-700 dark:!text-red-200 border-red-700 dark:border-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 data-[selected=true]:!bg-red-200 data-[selected=true]:!text-red-900 data-[selected=true]:border-red-200 dark:data-[selected=true]:!bg-red-700 dark:data-[selected=true]:border-red-700',
  orange: 'bg-transparent !text-orange-700 dark:!text-orange-200 border-orange-700 dark:border-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/50 data-[selected=true]:!bg-orange-200 data-[selected=true]:!text-orange-900 data-[selected=true]:border-orange-200 dark:data-[selected=true]:!bg-orange-700 dark:data-[selected=true]:border-orange-700',
  yellow: 'bg-transparent !text-yellow-700 dark:!text-yellow-200 border-yellow-700 dark:border-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 data-[selected=true]:!bg-yellow-200 data-[selected=true]:!text-yellow-900 data-[selected=true]:border-yellow-200 dark:data-[selected=true]:!bg-yellow-700 dark:data-[selected=true]:border-yellow-700',
  green: 'bg-transparent !text-green-700 dark:!text-green-200 border-green-700 dark:border-green-200 hover:bg-green-100 dark:hover:bg-green-900/50 data-[selected=true]:!bg-green-200 data-[selected=true]:!text-green-900 data-[selected=true]:border-green-200 dark:data-[selected=true]:!bg-green-700 dark:data-[selected=true]:border-green-700',
  blue: 'bg-transparent !text-blue-700 dark:!text-blue-200 border-blue-700 dark:border-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50 data-[selected=true]:!bg-blue-200 data-[selected=true]:!text-blue-900 data-[selected=true]:border-blue-200 dark:data-[selected=true]:!bg-blue-700 dark:data-[selected=true]:border-blue-700',
  purple: 'bg-transparent !text-purple-700 dark:!text-purple-200 border-purple-700 dark:border-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50 data-[selected=true]:!bg-purple-200 data-[selected=true]:!text-purple-900 data-[selected=true]:border-purple-200 dark:data-[selected=true]:!bg-purple-700 dark:data-[selected=true]:border-purple-700',
  pink: 'bg-transparent !text-pink-700 dark:!text-pink-200 border-pink-700 dark:border-pink-200 hover:bg-pink-100 dark:hover:bg-pink-900/50 data-[selected=true]:!bg-pink-200 data-[selected=true]:!text-pink-900 data-[selected=true]:border-pink-200 dark:data-[selected=true]:!bg-pink-700 dark:data-[selected=true]:border-pink-700',
  gray: 'bg-transparent !text-gray-700 dark:!text-gray-200 border-gray-700 dark:border-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900/50 data-[selected=true]:!bg-gray-200 data-[selected=true]:!text-gray-900 data-[selected=true]:border-gray-200 dark:data-[selected=true]:!bg-gray-700 dark:data-[selected=true]:border-gray-700',
}

export function CategorySelector({ categories, selectedCategoryId, onCategorySelect, disabled }: CategorySelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const visibleCategories = categories.slice(0, 3)
  const remainingCategories = categories.slice(3)

  // Check if selected category is in the "More" dropdown
  const selectedCategory = categories.find(cat => cat._id === selectedCategoryId)
  const isSelectedInMore = selectedCategory && remainingCategories.some(cat => cat._id === selectedCategoryId)

  // Auto-select first category when categories are loaded and none is selected or selected category is not in current list
  useEffect(() => {
    if (categories.length > 0) {
      const isSelectedCategoryInList = categories.some(cat => cat._id === selectedCategoryId)
      if (!selectedCategoryId || !isSelectedCategoryInList) {
        onCategorySelect(categories[0]._id)
      }
    }
  }, [categories, selectedCategoryId, onCategorySelect])

  const getCategoryIcon = (iconName: string) => {
    const IconComponent = categoryIconsMap[iconName]
    return IconComponent || categoryIconsMap.MoreHorizontal
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visibleCategories.map((category) => {
          const IconComponent = getCategoryIcon(category.icon)
          const isSelected = selectedCategoryId === category._id

          return (
            <Button
              key={category._id}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              data-selected={isSelected}
              className={cn(
                "flex items-center gap-2 border transition-colors",
                colorClasses[category.color]
              )}
              onClick={() => onCategorySelect(category._id)}
              title={category.name}
            >
              <IconComponent className="w-4 h-4" />
              {isSelected && (
                <span className="text-xs font-medium animate-in fade-in slide-in-from-left-1 duration-200">
                  {category.name}
                </span>
              )}
            </Button>
          )
        })}

        {remainingCategories.length > 0 && (
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                data-selected={isSelectedInMore}
                className={cn(
                  "flex items-center gap-2 border transition-colors",
                  isSelectedInMore && selectedCategory
                    ? colorClasses[selectedCategory.color]
                    : "border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700"
                )}
              >
                {isSelectedInMore && selectedCategory ? (
                  <>
                    {(() => {
                      const IconComponent = getCategoryIcon(selectedCategory.icon)
                      return <IconComponent className="w-4 h-4" />
                    })()}
                    <span className="text-xs font-medium max-w-none" title={selectedCategory.name}>
                      {selectedCategory.name}
                    </span>
                  </>
                ) : (
                  <>
                    <MoreHorizontal className="w-4 h-4" />
                    <span className="text-xs font-medium">More</span>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {remainingCategories.map((category) => {
                const IconComponent = getCategoryIcon(category.icon)
                const isSelected = selectedCategoryId === category._id

                return (
                  <DropdownMenuItem
                    key={category._id}
                    onClick={() => {
                      onCategorySelect(category._id)
                      setIsDropdownOpen(false)
                    }}
                    className={cn(
                      "flex items-center gap-3 cursor-pointer",
                      isSelected && "bg-accent"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center [&>svg]:!text-current",
                      category.color === 'red' && 'bg-red-200 text-red-900 dark:bg-red-700 dark:text-white',
                      category.color === 'orange' && 'bg-orange-200 text-orange-900 dark:bg-orange-700 dark:text-white',
                      category.color === 'yellow' && 'bg-yellow-200 text-yellow-900 dark:bg-yellow-700 dark:text-white',
                      category.color === 'green' && 'bg-green-200 text-green-900 dark:bg-green-700 dark:text-white',
                      category.color === 'blue' && 'bg-blue-200 text-blue-900 dark:bg-blue-700 dark:text-white',
                      category.color === 'purple' && 'bg-purple-200 text-purple-900 dark:bg-purple-700 dark:text-white',
                      category.color === 'pink' && 'bg-pink-200 text-pink-900 dark:bg-pink-700 dark:text-white',
                      category.color === 'gray' && 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white'
                    )}>
                      <IconComponent className="w-3 h-3" />
                    </div>
                    <span className="text-sm">{category.name}</span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
