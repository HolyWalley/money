import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp, Upload } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PortfolioMetrics } from './PortfolioMetrics'
import { formatMoney, formatSignedMoney } from '@/lib/format-money'
import { formatPercent, gainClass } from './PositionRow'
import {
  HISTORY_PERIODS,
  PERIOD_LABELS,
  axisTickLabel,
  downsample,
  moneyWeightedReturn,
  sliceHistory,
  windowProfit,
  windowStart,
  zeroCrossing,
  type HistoryPeriod,
  type HistoryPoint,
} from '@/lib/portfolio-history'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

/** Which of the three figures the curve is drawn from. */
export type ChartMode = 'value' | 'gain' | 'performance'

const MODES: Array<{ value: ChartMode; label: string }> = [
  { value: 'value', label: 'Value' },
  { value: 'gain', label: 'Profit/loss' },
  { value: 'performance', label: 'Performance' },
]

/**
 * How many points a curve is drawn from at most.
 *
 * A four-year history is around 1,500 days, and past a few hundred the extra
 * points are narrower than a pixel: they cost rendering time and change
 * nothing on screen.
 */
const MAX_POINTS = 260

/** What the yearly figure is, for anyone who hovers it. */
const MWR_EXPLANATION =
  'Money-weighted return: what the money itself earned each year, taking into account how much was invested and when, including dividends. Calculated with the XIRR method.'

const chartConfig = {
  metric: {
    label: 'Portfolio',
    theme: { light: 'var(--color-green-600)', dark: 'var(--color-green-400)' },
  },
  loss: {
    label: 'Portfolio',
    theme: { light: 'var(--color-red-600)', dark: 'var(--color-red-400)' },
  },
} satisfies ChartConfig

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const dayFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

function names(instruments: Instrument[]): string {
  return instruments.map(instrument => instrument.name).join(', ')
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86400000)
}

export interface PortfolioOverviewProps {
  /** One point per day, oldest first, over the whole history. */
  points: HistoryPoint[]
  /** Holdings the curve leaves out, so it can say so rather than read as smaller. */
  unpriced: Instrument[]
  /** Everything held today, in the base currency - the figure the page is headed with. */
  marketValue: number
  /** Nothing is held, so there is no figure to head the page with. */
  hasHoldings: boolean
  baseCurrency: string | undefined
  /** The day the history ends on, pinned by the hook rather than read per render. */
  asOf: Date
  isLoading: boolean
  /**
   * Starts a statement import. Absent while there is no account to import
   * into, which is the only state where the button would lead nowhere.
   */
  onImport?: () => void
}

/**
 * The portfolio in one block: what it is worth, what that has earned over the
 * window in view, and the curve it took to get there.
 *
 * One component rather than a header and a chart side by side, because every
 * figure above the curve belongs to the window the curve is drawn over - change
 * the window and the rate, the profit and the starting month all change with
 * it. Split in two, the two halves would have to agree by convention.
 */
export function PortfolioOverview({
  points,
  unpriced,
  marketValue,
  hasHoldings,
  baseCurrency,
  asOf,
  isLoading,
  onImport,
}: PortfolioOverviewProps) {
  // Performance first: what the holdings returned is the question a portfolio
  // page is opened with, and it is the one figure the value cannot be read off.
  const [mode, setMode] = useState<ChartMode>('performance')
  const [period, setPeriod] = useState<HistoryPeriod>('ALL')

  // Only the windows the history is actually long enough to fill: offering a
  // year of a portfolio opened last month draws the same curve four times.
  const periods = useMemo(() => {
    const first = points[0]?.date
    return HISTORY_PERIODS.filter(candidate => {
      if (candidate === 'ALL' || !first) return true
      const start = windowStart(candidate, asOf)
      return start !== null && start > first
    })
  }, [points, asOf])

  // A holding with no symbol is one click from being priced; one whose feed
  // simply does not reach back is not, and saying so differently is the
  // difference between an instruction and an apology.
  const needsSymbol = useMemo(() => unpriced.filter(instrument => !instrument.symbol), [unpriced])
  const unpricedWithSymbol = useMemo(
    () => unpriced.filter(instrument => Boolean(instrument.symbol)),
    [unpriced]
  )

  const window = useMemo(() => sliceHistory(points, period, asOf), [points, period, asOf])
  // Asked of the whole history rather than the window, so the tile does not
  // appear and vanish as the periods are pressed.
  const hasSales = useMemo(() => points.some(point => point.realised !== 0), [points])
  const drawn = useMemo(() => downsample(window, MAX_POINTS), [window])

  const data = useMemo(
    () =>
      drawn.map(point => ({
        date: point.date,
        metric: mode === 'value' ? point.value : mode === 'gain' ? point.gain : point.performance,
      })),
    [drawn, mode]
  )

  const first = window[0]
  const last = window[window.length - 1]
  const hasCurve = points.length > 1 && Boolean(first) && Boolean(last)

  return (
    <section className="rounded-lg border" aria-label="Portfolio">
      <h2 className="sr-only">Portfolio</h2>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {hasCurve &&
            periods.map(option => (
              <Button
                key={option}
                type="button"
                size="xs"
                variant={period === option ? 'secondary' : 'ghost'}
                aria-pressed={period === option}
                onClick={() => setPeriod(option)}
              >
                {PERIOD_LABELS[option]}
              </Button>
            ))}
        </div>

        {onImport && (
          <Button size="sm" onClick={onImport}>
            <Upload className="h-4 w-4" />
            Import statement
          </Button>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {isLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              hasHoldings && (
                <div
                  className="text-3xl font-bold tabular-nums"
                  title={`Valued at ${asOf.toLocaleDateString()}`}
                >
                  {formatMoney(marketValue)}{' '}
                  <span className="text-muted-foreground text-base font-normal">
                    {baseCurrency}
                  </span>
                </div>
              )
            )}
            {hasCurve && <WindowSummary window={window} />}
          </div>

          {hasCurve && (
            <div className="bg-muted inline-flex rounded-lg p-[3px]">
              {MODES.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  aria-pressed={mode === option.value}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    mode === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-[220px] w-full" data-testid="chart-loading" />
        ) : (
          hasCurve && (
            <>
              <Curve data={data} mode={mode} baseCurrency={baseCurrency} first={first} last={last} />

              {/* Two different gaps, because they cost the reader different
                  things: a holding with no symbol is one click from being on
                  the curve, and one the feed cannot reach never will be. */}
              {needsSymbol.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  The curve leaves out {names(needsSymbol)} — no symbol chosen yet, so there is no
                  price to value {needsSymbol.length === 1 ? 'it' : 'them'} with.
                </p>
              )}

              {unpricedWithSymbol.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  The curve leaves out {names(unpricedWithSymbol)} — no price history reaches back
                  far enough to value {unpricedWithSymbol.length === 1 ? 'it' : 'them'}.
                </p>
              )}

              {mode === 'gain' && (
                <p className="text-muted-foreground text-xs">
                  What everything held is worth, less what was paid for it. Money paid in moves
                  both, so only what the market did shows here.
                </p>
              )}
            </>
          )
        )}
      </div>

      {!isLoading && hasCurve && (
        <PortfolioMetrics window={window} hasSales={hasSales} baseCurrency={baseCurrency} />
      )}
    </section>
  )
}

/**
 * What the window earned, as a yearly rate and as money.
 *
 * The rate is money-weighted: it answers what the money itself earned given how
 * much of it was in and for how long, which is the figure a yearly return is
 * normally quoted as. Over a window too short to annualise there is no such
 * rate, and the window's own return stands in its place.
 */
function WindowSummary({ window }: { window: HistoryPoint[] }) {
  const first = window[0]
  const last = window[window.length - 1]
  // Every day of the window, not just its ends: the rate is solved from the
  // flows in between, and the profit counts each of them.
  const perYear = moneyWeightedReturn(window)
  const profit = windowProfit(window)
  const heading = perYear ?? last.performance
  const Arrow = heading < 0 ? TrendingDown : TrendingUp

  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      <Arrow className={cn('size-4 shrink-0', gainClass(heading))} aria-hidden="true" />
      {perYear === null ? (
        <span className={gainClass(last.performance)}>
          {formatPercent(last.performance * 100)}
        </span>
      ) : (
        <span className={gainClass(perYear)} title={MWR_EXPLANATION}>
          {formatPercent(perYear * 100)}/year
        </span>
      )}
      {profit !== null && (
        <span className={gainClass(profit)}>({formatSignedMoney(profit)})</span>
      )}
      <span className="text-muted-foreground font-normal">
        since {monthFormat.format(parseDayKey(first.date))}
      </span>
    </div>
  )
}

interface CurveProps {
  data: Array<{ date: string; metric: number }>
  mode: ChartMode
  baseCurrency: string | undefined
  first: HistoryPoint
  last: HistoryPoint
}

function Curve({ data, mode, baseCurrency, first, last }: CurveProps) {
  const isPercent = mode === 'performance'
  const days = daysBetween(first.date, last.date)

  // The y range the curve is drawn against, computed here rather than left to
  // the chart so that the colour split below lands on exactly the level the
  // axis puts it at.
  const metrics = data.map(point => point.metric)
  const low = Math.min(...metrics)
  const high = Math.max(...metrics)
  const padding = (high - low) * 0.06 || Math.abs(high) * 0.06 || 1
  const domain: [number, number] = [low - padding, high + padding]

  // Above the line green, below it red - a portfolio that spent last spring
  // under water should look it, rather than being painted by where it happens
  // to have ended up. A value has no such level: it cannot go below nothing.
  const crossing = mode === 'value' ? null : zeroCrossing(domain[0], domain[1])

  // Up is good for a portfolio, and what counts as up is whichever way the
  // drawn line went - not whether today's figure happens to be positive.
  const movement = data.length > 1 ? data[data.length - 1].metric - data[0].metric : 0
  const single = movement < 0 ? 'var(--color-loss)' : 'var(--color-metric)'

  const formatMetric = (value: number) =>
    isPercent ? formatPercent(value * 100) : formatMoney(value)

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="portfolio-stroke" x1="0" y1="0" x2="0" y2="1">
            {crossing === null ? (
              <>
                <stop offset={0} stopColor={single} />
                <stop offset={1} stopColor={single} />
              </>
            ) : (
              <>
                <stop offset={0} stopColor="var(--color-metric)" />
                <stop offset={crossing} stopColor="var(--color-metric)" />
                <stop offset={crossing} stopColor="var(--color-loss)" />
                <stop offset={1} stopColor="var(--color-loss)" />
              </>
            )}
          </linearGradient>
          <linearGradient id="portfolio-fill" x1="0" y1="0" x2="0" y2="1">
            {crossing === null ? (
              <>
                <stop offset="5%" stopColor={single} stopOpacity={0.28} />
                <stop offset="95%" stopColor={single} stopOpacity={0} />
              </>
            ) : (
              <>
                <stop offset={0} stopColor="var(--color-metric)" stopOpacity={0.28} />
                <stop offset={crossing} stopColor="var(--color-metric)" stopOpacity={0} />
                <stop offset={crossing} stopColor="var(--color-loss)" stopOpacity={0} />
                <stop offset={1} stopColor="var(--color-loss)" stopOpacity={0.28} />
              </>
            )}
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={48}
          tickFormatter={value => axisTickLabel(String(value), days)}
        />
        <YAxis
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={72}
          domain={domain}
          tickFormatter={value => formatMetric(Number(value))}
        />
        {/* Break-even, where the line crossing it is the whole point. */}
        {mode !== 'value' && <ReferenceLine y={0} strokeDasharray="3 3" />}
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const entry = payload[0]
            return (
              <div className="border-border/50 bg-background grid gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                <span className="text-muted-foreground">
                  {dayFormat.format(parseDayKey(String(entry.payload.date)))}
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {formatMetric(Number(entry.value))}
                  {!isPercent && ` ${baseCurrency ?? ''}`}
                </span>
              </div>
            )
          }}
        />
        <Area
          dataKey="metric"
          type="monotone"
          stroke="url(#portfolio-stroke)"
          strokeWidth={2}
          fill="url(#portfolio-fill)"
          // Filled to the level rather than to the floor, so the shading under
          // a loss hangs from zero the way the line does.
          baseValue={crossing === null ? 'dataMin' : 0}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
