import { useState } from 'react'
import { categoryIcons, categoryColors, type CategoryColor } from '@/lib/categoryIcons'
import { CategoryIcon } from './CategoryIcon'
import { ScrollArea } from '../ui/scroll-area'

interface IconColorSelectorProps {
  currentIcon: string
  currentColor: CategoryColor
  onIconChange: (icon: string) => void
  onColorChange: (color: CategoryColor) => void
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

export function IconColorSelector({
  currentIcon,
  currentColor,
  onIconChange,
  onColorChange
}: IconColorSelectorProps) {
  const [search, setSearch] = useState('')

  const filteredIcons = categoryIcons.filter(item => {
    const searchLower = search.toLowerCase()
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.category.toLowerCase().includes(searchLower) ||
      (item.keywords && item.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)))
    )
  })

  const groupedIcons = filteredIcons.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, typeof filteredIcons>)

  return (
    <div className="w-[300px] space-y-4">
      {/* Color Selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <div className="grid grid-cols-4 gap-2">
          {categoryColors.map(color => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              className={`
                w-full h-10 rounded-md border-2 transition-all
                ${colorClassMap[color]}
                ${currentColor === color ? 'border-foreground' : 'border-transparent'}
              `}
              aria-label={`Select ${color} color`}
            />
          ))}
        </div>
      </div>

      {/* Icon Selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Icon</p>
        <input
          type="text"
          placeholder="Search icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <ScrollArea className="h-[250px] w-full rounded-md border">
          <div className="p-3 space-y-4">
            {filteredIcons.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No icons found.</p>
            ) : (
              Object.entries(groupedIcons).map(([category, icons]) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{category}</p>
                  <div className="flex flex-wrap gap-1">
                    {icons.map(item => (
                      <button
                        key={item.icon}
                        onClick={() => onIconChange(item.icon)}
                        className={`
                          relative p-1 rounded-md transition-all
                          ${currentIcon === item.icon
                            ? 'bg-primary/20 shadow-sm scale-110'
                            : 'hover:bg-accent'
                          }
                        `}
                        title={item.name}
                      >
                        <CategoryIcon icon={item.icon} color={currentColor} size="sm" />
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
