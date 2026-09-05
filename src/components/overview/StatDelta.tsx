import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { percentChange } from '@/lib/period-comparison'
import { formatMoney } from '@/lib/format-money'

interface StatDeltaProps {
  current: number
  previous: number
  /** Which way this figure has to move for it to be good news. */
  goodDirection: 'up' | 'down'
  baseCurrency: string
}

const NO_CHANGE_THRESHOLD = 0.05

export function StatDelta({ current, previous, goodDirection, baseCurrency }: StatDeltaProps) {
  const change = percentChange(current, previous)

  // Nothing is infinitely more than nothing: with no baseline there is no
  // percentage to state, and inventing one would be worse than staying quiet.
  if (change === null) {
    return null
  }

  const flat = Math.abs(change) < NO_CHANGE_THRESHOLD
  const up = change > 0
  const good = up === (goodDirection === 'up')

  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown
  const color = flat ? 'text-muted-foreground' : good ? 'text-green-600' : 'text-red-600'

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs ${color}`}
      title={`Previous period: ${formatMoney(previous)} ${baseCurrency}`}
    >
      <Icon className="h-3 w-3" />
      {flat ? 'flat' : `${Math.abs(change).toFixed(0)}%`}
    </span>
  )
}
