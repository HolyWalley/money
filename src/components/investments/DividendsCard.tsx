import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format-money'
import {
  dividendYears,
  dividendsIn,
  totalDividends,
  trailingTwelveMonths,
  yearlyTotals,
  type MonthlyDividend,
} from '@/lib/dividend-history'

/** Bars read a total off at a glance; the grid says which months pay at all. */
export type DividendView = 'bars' | 'heatmap'

/** 'all' is every year there is; 'ttm' the rolling last twelve months. */
export type DividendPeriod = 'all' | 'ttm' | number

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const chartConfig = {
  amount: {
    label: 'Dividends',
    // The same green the app reads gains in: a dividend is income, and a
    // second accent would say it is something else.
    theme: { light: 'var(--color-green-600)', dark: 'var(--color-green-400)' },
  },
} satisfies ChartConfig

export interface DividendsCardProps {
  months: MonthlyDividend[]
  /** Currencies no rate reaches, whose payments are therefore not in the totals. */
  missingCurrencies: string[]
  baseCurrency: string | undefined
  /** Pinned by the caller, so a rolling year does not move between renders. */
  asOf: Date
}

function selected(months: MonthlyDividend[], period: DividendPeriod, asOf: Date): MonthlyDividend[] {
  if (period === 'all') return months
  if (period === 'ttm') return trailingTwelveMonths(months, asOf)
  return dividendsIn(months, period)
}

/**
 * Years where a whole history is asked for, months where one year is.
 *
 * A single year's total is one bar, which says nothing a number could not; the
 * months it arrived in are the answer worth drawing.
 */
function bars(
  months: MonthlyDividend[],
  period: DividendPeriod
): Array<{ label: string; amount: number }> {
  if (period === 'all') {
    return yearlyTotals(months).map(entry => ({ label: String(entry.year), amount: entry.amount }))
  }

  if (period === 'ttm') {
    return months.map(month => ({
      label: `${MONTHS[month.month]} ${String(month.year).slice(2)}`,
      amount: month.amount,
    }))
  }

  const byMonth = new Map(months.map(month => [month.month, month.amount]))
  return MONTHS.map((label, month) => ({ label, amount: byMonth.get(month) ?? 0 }))
}

interface HeatmapProps {
  months: MonthlyDividend[]
  baseCurrency: string | undefined
}

/**
 * Every month of every year, shaded by what it paid.
 *
 * A quarterly payer shows as four columns and an annual one as a single
 * stripe, which is the pattern a bar chart of yearly totals hides.
 */
function Heatmap({ months, baseCurrency }: HeatmapProps) {
  const years = dividendYears(months)
  const byKey = new Map(months.map(month => [`${month.year}-${month.month}`, month.amount]))
  const largest = months.reduce((most, month) => Math.max(most, month.amount), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-10" />
            {MONTHS.map(month => (
              <th key={month} scope="col" className="text-muted-foreground font-medium">
                {month}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map(year => (
            <tr key={year}>
              <th scope="row" className="text-muted-foreground text-right font-medium">
                {year}
              </th>
              {MONTHS.map((label, month) => {
                const amount = byKey.get(`${year}-${month}`)
                // Shaded by size, but every month that paid at all stays
                // visible: a tiny payment is still a payment.
                const weight = amount && largest > 0 ? 0.15 + (amount / largest) * 0.85 : 0
                return (
                  <td
                    key={label}
                    className={cn(
                      'rounded-md py-1.5 text-center tabular-nums',
                      amount === undefined && 'bg-muted/40'
                    )}
                    style={
                      amount === undefined
                        ? undefined
                        : {
                            backgroundColor: `color-mix(in oklab, var(--color-green-500) ${weight * 100}%, transparent)`,
                          }
                    }
                    title={
                      amount === undefined
                        ? `${label} ${year}: nothing`
                        : `${label} ${year}: ${formatMoney(amount)} ${baseCurrency ?? ''}`.trim()
                    }
                  >
                    {amount === undefined ? '' : formatMoney(amount)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DividendsCard({
  months,
  missingCurrencies,
  baseCurrency,
  asOf,
}: DividendsCardProps) {
  const [view, setView] = useState<DividendView>('bars')
  const [period, setPeriod] = useState<DividendPeriod>('all')

  const years = useMemo(() => dividendYears(months), [months])
  const shown = useMemo(() => selected(months, period, asOf), [months, period, asOf])
  const data = useMemo(() => bars(shown, period), [shown, period])
  const total = useMemo(() => totalDividends(shown), [shown])

  // Nothing has ever been paid out, and an empty chart of it says less than no
  // chart at all. Accumulating ETFs pay nothing by design.
  if (months.length === 0) return null

  const periods: DividendPeriod[] = ['all', 'ttm', ...years]
  const periodLabel = (option: DividendPeriod) =>
    option === 'all' ? 'All' : option === 'ttm' ? 'TTM' : String(option)

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="Dividends">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Dividends</h2>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatMoney(total)} {baseCurrency}{' '}
            {period === 'all' ? 'in total' : period === 'ttm' ? 'over the last year' : `in ${period}`}
          </p>
        </div>
        <div className="bg-muted inline-flex rounded-lg p-[3px]">
          {(['bars', 'heatmap'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                view === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option === 'bars' ? 'Bar chart' : 'Heatmap'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {periods.map(option => (
          <Button
            key={String(option)}
            type="button"
            size="xs"
            variant={period === option ? 'secondary' : 'ghost'}
            aria-pressed={period === option}
            onClick={() => setPeriod(option)}
          >
            {periodLabel(option)}
          </Button>
        ))}
      </div>

      {view === 'bars' ? (
        <ChartContainer config={chartConfig} className="aspect-auto h-[180px] w-full">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const entry = payload[0]
                return (
                  <div className="border-border/50 bg-background grid gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                    <span className="text-muted-foreground">{String(entry.payload.label)}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatMoney(Number(entry.value))} {baseCurrency}
                    </span>
                  </div>
                )
              }}
            />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={4} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      ) : (
        <Heatmap months={shown} baseCurrency={baseCurrency} />
      )}

      {missingCurrencies.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Leaves out what was paid in {missingCurrencies.join(', ')} — no exchange rate available.
        </p>
      )}
    </section>
  )
}
