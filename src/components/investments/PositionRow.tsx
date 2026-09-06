import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatMoney, formatPrice, formatSignedMoney } from '@/lib/format-money'
import type { PortfolioPosition } from '@/hooks/usePortfolio'
import type { ExclusionReason } from '@/lib/positions'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

/**
 * Shares are not money. A holding of 468.09345794 is exact to its last decimal
 * and a whole 32 is a whole 32, so quantities are neither rounded to cents nor
 * padded out to eight places.
 */
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })

export function formatQuantity(quantity: number): string {
  return quantityFormat.format(quantity)
}

/** Nothing at all to show, as opposed to a confident zero. */
const NOTHING = '—'

/**
 * Up is good for a holding, unconditionally: a position is worth more than it
 * cost or it is not.
 */
export function gainClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return 'text-muted-foreground'
  return value > 0 ? 'text-green-600' : 'text-red-600'
}

/** A gain as a share of what it took to earn it, or null with nothing to measure against. */
export function returnPercent(gain: number | null, cost: number): number | null {
  if (gain === null || cost <= 0) return null
  return (gain / cost) * 100
}

export function formatPercent(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
}

function formatMoneyOrNothing(amount: number | null): string {
  return amount === null ? NOTHING : formatMoney(amount)
}

const EXCLUSION_REASONS: Record<ExclusionReason, string> = {
  'unreadable-date': 'an unreadable date',
  'foreign-currency': 'another currency',
}

/**
 * What this row is not telling you, in plain words: a holding whose history
 * starts mid-story, rows the position could not absorb, and cash paid out for
 * shares nothing ever counted.
 */
function positionWarnings(position: PortfolioPosition): string[] {
  const warnings: string[] = []

  if (position.status === 'unquantified') {
    warnings.push(
      `${formatMoney(position.cost)} ${position.currency} paid for shares the statement never counted`
    )
  }

  if (position.oversold) {
    warnings.push('A sale took more than the history shows was ever bought')
  }

  if (position.excluded.length > 0) {
    const reasons = [...new Set(position.excluded.map(({ reason }) => EXCLUSION_REASONS[reason]))]
    warnings.push(
      `${position.excluded.length} row${position.excluded.length === 1 ? '' : 's'} left out: ${reasons.join(' and ')}`
    )
  }

  return warnings
}

function PositionWarnings({ position }: { position: PortfolioPosition }) {
  const warnings = positionWarnings(position)
  if (warnings.length === 0) return null

  return (
    <ul className="mt-1 space-y-0.5">
      {warnings.map(warning => (
        <li key={warning} className="text-muted-foreground flex items-start gap-1 text-xs">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The listing this holding is priced from, and the currency its figures are in.
 *
 * The symbol is a button whenever there is an instrument behind it, not only
 * when none has been chosen: searching an ISIN returns some listing of a
 * security rather than the one that was actually bought - a London USD line
 * where the holding is the Xetra EUR one - so a wrong pick is likely enough
 * that it has to stay correctable. Left as plain text it would misprice the
 * holding for good.
 */
function InstrumentSubtitle({ position, onResolveSymbol }: PositionRowProps) {
  const identifier = position.symbol ?? position.instrument?.ticker ?? position.instrument?.isin ?? null
  const instrument = position.instrument

  if (!identifier || !instrument) {
    return <>{position.currency}</>
  }

  return (
    <>
      <Button
        variant="link"
        size="xs"
        className="h-auto p-0 text-xs font-normal text-muted-foreground underline decoration-dotted underline-offset-2"
        onClick={() => onResolveSymbol(instrument)}
        title={`Change the listing ${name(position)} is priced from`}
      >
        {identifier}
      </Button>
      {` · ${position.currency}`}
    </>
  )
}

/**
 * The close, or why there is none. An unresolved symbol is the one gap the user
 * can close themselves, so it is offered as an action rather than a dash.
 */
function PriceCell({ position, onResolveSymbol }: PositionRowProps) {
  if (position.status === 'needs-symbol' && position.instrument) {
    const instrument = position.instrument
    return (
      <Button
        variant="link"
        size="xs"
        className="h-auto p-0"
        onClick={() => onResolveSymbol(instrument)}
      >
        Choose symbol
      </Button>
    )
  }

  if (position.close === null) {
    return <span className="text-muted-foreground">{position.isClosed ? NOTHING : 'No close'}</span>
  }

  return <>{formatPrice(position.close)}</>
}

export interface PositionRowProps {
  position: PortfolioPosition
  /** Opens the symbol search for a holding whose price feed was never resolved. */
  onResolveSymbol: (instrument: Instrument) => void
}

function name(position: PortfolioPosition): string {
  return position.instrument?.name ?? 'Unknown holding'
}

function quantityText(position: PortfolioPosition): string {
  if (position.status === 'unquantified') return 'Unknown'
  return position.isClosed ? NOTHING : formatQuantity(position.quantity)
}

function averageCostText(position: PortfolioPosition): string {
  return position.isClosed ? NOTHING : formatPrice(position.averageCost)
}

/** One holding as a row of the wide table. */
export function PositionRow({ position, onResolveSymbol }: PositionRowProps) {
  const percent = returnPercent(position.unrealised, position.cost)

  return (
    <TableRow>
      <TableCell className="max-w-[16rem] whitespace-normal">
        <div className="font-medium">{name(position)}</div>
        <div className="text-muted-foreground text-xs">
          <InstrumentSubtitle position={position} onResolveSymbol={onResolveSymbol} />
        </div>
        <PositionWarnings position={position} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{quantityText(position)}</TableCell>
      <TableCell className="text-right tabular-nums">{averageCostText(position)}</TableCell>
      <TableCell className="text-right tabular-nums">
        <PriceCell position={position} onResolveSymbol={onResolveSymbol} />
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatMoneyOrNothing(position.marketValue)}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${gainClass(position.unrealised)}`}>
        {position.unrealised === null ? (
          NOTHING
        ) : (
          <>
            {formatSignedMoney(position.unrealised)}
            {percent !== null && <span className="ml-1 text-xs">{formatPercent(percent)}</span>}
          </>
        )}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${gainClass(position.realised)}`}>
        {formatSignedMoney(position.realised)}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${position.dividends === 0 ? 'text-muted-foreground' : ''}`}
      >
        {formatMoney(position.dividends)}
      </TableCell>
      <TableCell
        className={`text-right font-medium tabular-nums ${gainClass(position.totalReturn)}`}
      >
        {position.totalReturn === null ? NOTHING : formatSignedMoney(position.totalReturn)}
      </TableCell>
    </TableRow>
  )
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`tabular-nums ${className ?? ''}`}>{value}</dd>
    </div>
  )
}

/** The same holding on a phone, where nine columns have nowhere to go. */
export function PositionCard({ position, onResolveSymbol }: PositionRowProps) {
  const percent = returnPercent(position.unrealised, position.cost)

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{name(position)}</div>
          <div className="text-muted-foreground text-xs">
          <InstrumentSubtitle position={position} onResolveSymbol={onResolveSymbol} />
        </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">
            {formatMoneyOrNothing(position.marketValue)}
          </div>
          <div className={`text-xs tabular-nums ${gainClass(position.unrealised)}`}>
            {position.unrealised === null
              ? NOTHING
              : `${formatSignedMoney(position.unrealised)}${percent === null ? '' : ` (${formatPercent(percent)})`}`}
          </div>
        </div>
      </div>

      <PositionWarnings position={position} />

      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
        <Figure label="Quantity" value={quantityText(position)} />
        <Figure label="Avg cost" value={averageCostText(position)} />
        <div>
          <dt className="text-muted-foreground text-xs">Close</dt>
          <dd className="tabular-nums">
            <PriceCell position={position} onResolveSymbol={onResolveSymbol} />
          </dd>
        </div>
        <Figure
          label="Realised"
          value={formatSignedMoney(position.realised)}
          className={gainClass(position.realised)}
        />
        <Figure
          label="Dividends"
          value={formatMoney(position.dividends)}
          className={position.dividends === 0 ? 'text-muted-foreground' : ''}
        />
        <Figure
          label="Total return"
          value={position.totalReturn === null ? NOTHING : formatSignedMoney(position.totalReturn)}
          className={gainClass(position.totalReturn)}
        />
      </dl>
    </div>
  )
}
