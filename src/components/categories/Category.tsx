import * as Icons from 'lucide-react'
import type { Category as CategoryType } from '../../../shared/schemas/category.schema'

interface CategoryProps {
  category: CategoryType
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

export function Category({ category }: CategoryProps) {
  const renderIcon = (iconName: string) => {
    const Icon = Icons[iconName as keyof typeof Icons] as React.FC<{ className?: string }>
    return Icon ? <Icon className="w-5 h-5" /> : null
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
      <div className={`p-2 rounded-lg ${colorClassMap[category.color]}`}>
        {renderIcon(category.icon)}
      </div>
      <span className="font-medium">{category.name}</span>
    </div>
  )
}
