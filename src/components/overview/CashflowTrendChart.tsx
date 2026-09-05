import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatMoney } from '@/lib/format-money'
import { periodTickLabel } from '@/lib/period-series'
import type { TrendPoint } from '@/hooks/usePeriodTrend'
import type { PeriodType } from '@/lib/period-utils'

interface CashflowTrendChartProps {
  points: TrendPoint[]
  periodType: PeriodType
  baseCurrency: string
}

const chartConfig = {
  income: {
    label: 'Income',
    theme: { light: 'var(--color-green-600)', dark: 'var(--color-green-400)' },
  },
  expense: {
    label: 'Expense',
    theme: { light: 'var(--color-red-600)', dark: 'var(--color-red-400)' },
  },
} satisfies ChartConfig

export function CashflowTrendChart({ points, periodType, baseCurrency }: CashflowTrendChartProps) {
  const data = useMemo(
    () =>
      points.map(point => ({
        label: periodTickLabel(point.period.start, periodType),
        income: point.income,
        expense: point.expense,
      })),
    [points, periodType]
  )

  return (
    <div className="border rounded-lg p-4">
      <div className="text-sm font-medium mb-4">Income vs expense</div>
      <ChartContainer config={chartConfig} className="aspect-auto h-[180px] w-full">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex flex-1 justify-between items-center gap-3">
                    <span className="text-muted-foreground capitalize">{name}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatMoney(Number(value))} {baseCurrency}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="income" fill="var(--color-income)" radius={4} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
