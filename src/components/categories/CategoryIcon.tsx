import type { CategoryColor } from '@/lib/categoryIcons'
import { categoryIconsMap } from '@/lib/categoryIconsMap'
import { cn } from '@/lib/utils'

interface CategoryIconProps {
  icon: string
  color: CategoryColor
  size?: 'sm' | 'md' | 'lg'
  className?: string
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

const sizeClasses = {
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-3'
}

const iconSizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6'
}

export function CategoryIcon({ icon, color, size = 'md', className }: CategoryIconProps) {
  const Icon = categoryIconsMap[icon]
  
  if (!Icon) return null
  
  return (
    <div className={cn(
      'rounded-lg [&>svg]:!text-current',
      colorClassMap[color],
      sizeClasses[size],
      className
    )}>
      <Icon className={iconSizeClasses[size]} />
    </div>
  )
}
