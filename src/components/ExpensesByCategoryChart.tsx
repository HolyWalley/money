import { useMemo } from 'react'
import { Pie, PieChart, Cell, Label } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import type { Category } from '../../shared/schemas/category.schema'

interface ExpensesByCategoryChartProps {
  expensesByCategory: Map<string, number>
  categories: Category[]
  baseCurrency: string
  selectedCategoryId: string | null
  onCategoryClick: (categoryId: string | null) => void
}

interface ChartDataItem {
  categoryId: string
  name: string
  value: number
  icon: string
  color: Category['color']
}

const colorThemes: Record<Category['color'], { light: string; dark: string }> = {
  red: { light: 'var(--color-red-700)', dark: 'var(--color-red-200)' },
  orange: { light: 'var(--color-orange-700)', dark: 'var(--color-orange-200)' },
  yellow: { light: 'var(--color-yellow-700)', dark: 'var(--color-yellow-200)' },
  green: { light: 'var(--color-green-700)', dark: 'var(--color-green-200)' },
  blue: { light: 'var(--color-blue-700)', dark: 'var(--color-blue-200)' },
  purple: { light: 'var(--color-purple-700)', dark: 'var(--color-purple-200)' },
  pink: { light: 'var(--color-pink-700)', dark: 'var(--color-pink-200)' },
  gray: { light: 'var(--color-gray-700)', dark: 'var(--color-gray-200)' },
}

export function ExpensesByCategoryChart({ expensesByCategory, categories, baseCurrency, selectedCategoryId, onCategoryClick }: ExpensesByCategoryChartProps) {
  const chartData = useMemo<ChartDataItem[]>(() => {
    const data: ChartDataItem[] = []

    expensesByCategory.forEach((amount, categoryId) => {
      const category = categories.find(c => c._id === categoryId)
      if (!category) return

      data.push({
        categoryId,
        name: category.name,
        value: amount,
        icon: category.icon,
        color: category.color,
      })
    })

    return data.sort((a, b) => b.value - a.value)
  }, [expensesByCategory, categories])

  const totalExpense = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0)
  }, [chartData])

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; theme: { light: string; dark: string } }> = {}
    chartData.forEach(item => {
      config[item.categoryId] = {
        label: item.name,
        theme: colorThemes[item.color],
      }
    })
    return config
  }, [chartData])

  if (chartData.length === 0) {
    return null
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="text-sm font-medium mb-4">Expenses by Category</div>
      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => (
                  <div className="flex items-center gap-2 w-full">
                    <CategoryIcon
                      icon={item.payload.icon}
                      color={item.payload.color}
                      size="sm"
                    />
                    <div className="flex flex-1 justify-between items-center gap-2">
                      <span className="text-muted-foreground">{item.payload.name}</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {Number(value).toFixed(2)} {baseCurrency}
                      </span>
                    </div>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            strokeWidth={2}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.categoryId}
                fill={`var(--color-${entry.categoryId})`}
                onClick={() => {
                  onCategoryClick(selectedCategoryId === entry.categoryId ? null : entry.categoryId)
                }}
                style={{ cursor: 'pointer' }}
              />
            ))}
            <Label
              content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-2xl font-bold"
                      >
                        {totalExpense.toFixed(2)}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 24}
                        className="fill-muted-foreground text-xs"
                      >
                        {baseCurrency}
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  )
}
