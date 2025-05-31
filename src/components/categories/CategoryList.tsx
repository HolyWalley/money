import type { Category as CategoryType } from '../../../shared/schemas/category.schema'
import { Category } from './Category'

interface CategoryListProps {
  categories: CategoryType[]
  title: string
}

export function CategoryList({ categories, title }: CategoryListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="grid gap-2">
        {categories.map(category => (
          <Category key={category._id} category={category} />
        ))}
      </div>
    </div>
  )
}
