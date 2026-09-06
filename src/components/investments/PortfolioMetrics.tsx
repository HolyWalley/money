import { formatMoney, formatSignedMoney } from '@/lib/format-money'
import { annualisedVolatility, windowRealised, type HistoryPoint } from '@/lib/portfolio-history'
import { formatPercent, gainClass } from './PositionRow'

/** Shown where a figure exists but cannot be stated, so a tile never sits empty. */
const NOTHING = '—'

const EXPLANATIONS = {
  invested: 'What was paid for everything still held, each purchase converted at the rate of the day it was made.',
  performance:
    'Time-weighted return: how the holdings performed regardless of how much money was in them and when, so paying more in neither helps nor hurts it. It counts dividends and interest received, and the fees it took to earn them, and it will differ from the money-weighted rate above.',
  volatility:
    'The annualised standard deviation of the daily time-weighted returns. Higher means the returns varied more widely, both up and down.',
  realised: 'What the sales in this window made over the cost they released.',
} as const

interface MetricProps {
  label: string
  explanation: string
  value: string
  /** Green above nothing, red below it; absent where up and down are not better and worse. */
  tone?: string
  unit?: string
}

function Metric({ label, explanation, value, tone, unit }: MetricProps) {
  return (
    <div className="space-y-0.5">
      {/* The explanation hangs off the label rather than a marker of its own:
          four dotted underlines in a row read as four links, and the rate above
          the curve already carries its own definition the same quiet way. */}
      <dt className="text-muted-foreground cursor-help text-xs" title={explanation}>
        {label}
      </dt>
      <dd className={`font-semibold tabular-nums ${tone ?? ''}`}>
        {value}
        {unit && <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>}
      </dd>
    </div>
  )
}

export interface PortfolioMetricsProps {
  /**
   * The window the curve above is drawn over, at full resolution rather than
   * the downsampled series the chart draws: a standard deviation of every
   * fourth day is a standard deviation of a different portfolio.
   */
  window: HistoryPoint[]
  /**
   * Whether anything has ever been sold. A tile that reads 0.00 for ever is
   * worse than no tile, and the answer must not change with the period or it
   * would appear and vanish as the tabs are pressed.
   */
  hasSales: boolean
  baseCurrency: string | undefined
}

/**
 * What the window is made of, beside what it returned.
 *
 * Every figure here comes from the same daily series as the curve above it -
 * one engine, one set of conversions - so nothing in this block can disagree
 * with the line it sits under. Two of them are absolute, as the value in the
 * headline is, and two belong to the window; which is which is what the
 * explanations say.
 */
export function PortfolioMetrics({ window, hasSales, baseCurrency }: PortfolioMetricsProps) {
  const last = window[window.length - 1]
  if (!last) return null

  const volatility = annualisedVolatility(window)
  const realised = windowRealised(window)

  // Spaced rather than ruled into cells: a divider drawn between grid children
  // lands in the wrong place the moment a row wraps, and with three tiles in
  // four columns it would rule off an empty one.
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t p-4 sm:grid-cols-4">
      <Metric
        label="Invested"
        explanation={EXPLANATIONS.invested}
        value={formatMoney(last.invested)}
        unit={baseCurrency}
      />
      {/* Not "Performance": the mode toggle above already carries that word for
          the curve it draws, and the headline beside it states a money-weighted
          rate. Naming this one for its method is what keeps the two apart. */}
      <Metric
        label="Time-weighted return"
        explanation={EXPLANATIONS.performance}
        value={formatPercent(last.performance * 100)}
        tone={gainClass(last.performance)}
      />
      <Metric
        label="Volatility"
        explanation={EXPLANATIONS.volatility}
        // Unsigned: a spread has no direction, and a leading + would read as
        // one. Neutral in colour for the same reason - a portfolio that moves
        // a lot is not thereby doing well or badly.
        value={volatility === null ? NOTHING : `${(volatility * 100).toFixed(1)}%`}
      />
      {hasSales && (
        <Metric
          label="Realised"
          explanation={EXPLANATIONS.realised}
          value={realised === null ? NOTHING : formatSignedMoney(realised)}
          tone={gainClass(realised)}
          unit={baseCurrency}
        />
      )}
    </dl>
  )
}
