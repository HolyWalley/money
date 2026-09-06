import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SymbolPicker } from './SymbolPicker'
import {
  PositionCard,
  PositionRow,
  formatPercent,
  gainClass,
  returnPercent,
} from './PositionRow'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLiveTrades } from '@/hooks/useLiveTrades'
import { formatMoney, formatSignedMoney } from '@/lib/format-money'
import type { PortfolioPosition, UsePortfolioResult } from '@/hooks/usePortfolio'
import type { PortfolioSummary } from '@/lib/positions'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

/** Exactly what usePortfolio() hands back, so the page can spread it in. */
export type PositionsTableProps = UsePortfolioResult

const COLUMNS = [
  { key: 'instrument', label: 'Holding', align: 'text-left' },
  { key: 'quantity', label: 'Quantity', align: 'text-right' },
  { key: 'averageCost', label: 'Avg cost', align: 'text-right' },
  { key: 'close', label: 'Close', align: 'text-right' },
  { key: 'marketValue', label: 'Market value', align: 'text-right' },
  { key: 'unrealised', label: 'Unrealised', align: 'text-right' },
  { key: 'realised', label: 'Realised', align: 'text-right' },
  { key: 'dividends', label: 'Dividends', align: 'text-right' },
  { key: 'totalReturn', label: 'Total return', align: 'text-right' },
] as const

function nameList(instrumentIds: string[], nameOf: (instrumentId: string) => string): string {
  return instrumentIds.map(nameOf).join(', ')
}

/**
 * Everything the totals leave out, each said the same way the rest of the app
 * says it, because two differently worded warnings read as two unrelated
 * problems.
 */
function exclusions(
  summary: PortfolioSummary,
  needsSymbol: Instrument[],
  nameOf: (instrumentId: string) => string
): string[] {
  const notes: string[] = []
  const unresolved = new Set(needsSymbol.map(instrument => instrument._id))

  if (needsSymbol.length > 0) {
    notes.push(
      `Excludes ${needsSymbol.map(instrument => instrument.name).join(', ')} — no symbol chosen yet.`
    )
  }

  // The ones a symbol would not rescue: the feed simply has no close for them.
  const unpriced = summary.missingPrices.filter(instrumentId => !unresolved.has(instrumentId))
  if (unpriced.length > 0) {
    notes.push(`Excludes ${nameList(unpriced, nameOf)} — no recent close available.`)
  }

  if (summary.missingCurrencies.length > 0) {
    notes.push(`Excludes ${summary.missingCurrencies.join(', ')} — no exchange rate available.`)
  }

  if (summary.unquantified.length > 0) {
    notes.push(
      `Excludes ${nameList(summary.unquantified, nameOf)} — the statement never counted the shares.`
    )
  }

  return notes
}

function PositionsSkeleton() {
  return (
    <div className="space-y-2" data-testid="positions-loading">
      {[0, 1, 2].map(row => (
        <Skeleton key={row} className="h-14 w-full" />
      ))}
    </div>
  )
}

function EmptyPositions() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <TrendingUp className="text-muted-foreground mb-4 h-10 w-10" />
      <h3 className="mb-1 font-semibold">No holdings yet</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Import a statement from one of your broker accounts and every position it contains will be
        listed here, valued at the latest close.
      </p>
    </div>
  )
}

interface TotalsProps {
  summary: PortfolioSummary
  baseCurrency: string | undefined
}

/** The column totals where there are no columns to line them up under. */
function TotalsCard({ summary, baseCurrency }: TotalsProps) {
  const percent = returnPercent(summary.unrealised, summary.cost)

  return (
    <dl
      className="bg-muted/30 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3 text-sm"
      data-testid="portfolio-totals"
    >
      <div>
        <dt className="text-muted-foreground text-xs">Market value</dt>
        <dd className="font-semibold tabular-nums">
          {formatMoney(summary.marketValue)}{' '}
          <span className="text-muted-foreground text-xs font-normal">{baseCurrency}</span>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Unrealised</dt>
        <dd className={`font-semibold tabular-nums ${gainClass(summary.unrealised)}`}>
          {formatSignedMoney(summary.unrealised)}
          {percent !== null && <span className="ml-1 text-xs">{formatPercent(percent)}</span>}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Realised</dt>
        <dd className={`tabular-nums ${gainClass(summary.realised)}`}>
          {formatSignedMoney(summary.realised)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Dividends</dt>
        <dd className="tabular-nums">{formatMoney(summary.dividends)}</dd>
      </div>
      <div className="col-span-2 border-t pt-3">
        <dt className="text-muted-foreground text-xs">Total return</dt>
        <dd className={`font-semibold tabular-nums ${gainClass(summary.totalReturn)}`}>
          {formatSignedMoney(summary.totalReturn)}
        </dd>
      </div>
    </dl>
  )
}

function TotalsRow({ summary, baseCurrency }: TotalsProps) {
  const percent = returnPercent(summary.unrealised, summary.cost)

  return (
    <TableRow data-testid="portfolio-totals">
      <TableCell className="font-medium">
        Total{' '}
        <span className="text-muted-foreground text-xs font-normal">{baseCurrency}</span>
      </TableCell>
      <TableCell colSpan={3} />
      <TableCell className="text-right font-semibold tabular-nums">
        {formatMoney(summary.marketValue)}
      </TableCell>
      <TableCell className={`text-right font-semibold tabular-nums ${gainClass(summary.unrealised)}`}>
        {formatSignedMoney(summary.unrealised)}
        {percent !== null && <span className="ml-1 text-xs">{formatPercent(percent)}</span>}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${gainClass(summary.realised)}`}>
        {formatSignedMoney(summary.realised)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(summary.dividends)}</TableCell>
      <TableCell className={`text-right font-semibold tabular-nums ${gainClass(summary.totalReturn)}`}>
        {formatSignedMoney(summary.totalReturn)}
      </TableCell>
    </TableRow>
  )
}

interface HoldingsProps {
  rows: PortfolioPosition[]
  isMobile: boolean
  onResolveSymbol: (instrument: Instrument) => void
  /** Rendered under the last row; only the open holdings have totals worth stating. */
  totals?: TotalsProps
  label: string
}

function Holdings({ rows, isMobile, onResolveSymbol, totals, label }: HoldingsProps) {
  if (isMobile) {
    return (
      <div className="space-y-2">
        {rows.map(position => (
          <PositionCard
            key={position.instrumentId}
            position={position}
            onResolveSymbol={onResolveSymbol}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            {COLUMNS.map(column => (
              <TableHead key={column.key} className={column.align}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(position => (
            <PositionRow
              key={position.instrumentId}
              position={position}
              onResolveSymbol={onResolveSymbol}
            />
          ))}
        </TableBody>
        {totals && (
          <TableFooter>
            <TotalsRow {...totals} />
          </TableFooter>
        )}
      </Table>
    </div>
  )
}

export function PositionsTable({
  positions,
  summary,
  needsSymbol,
  baseCurrency,
  asOf,
  isLoading,
}: PositionsTableProps) {
  const isMobile = useIsMobile()
  const [resolving, setResolving] = useState<Instrument | null>(null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  // A holding whose shares were never counted is not history the way a sold-out
  // one is, so it stays in the open list where the user can see what it cost.
  const open = useMemo(() => positions.filter(position => position.status !== 'closed'), [positions])
  const closed = useMemo(
    () => positions.filter(position => position.status === 'closed'),
    [positions]
  )

  const nameOf = useMemo(() => {
    const names = new Map(
      positions.map(position => [position.instrumentId, position.instrument?.name ?? 'Unknown holding'])
    )
    return (instrumentId: string) => names.get(instrumentId) ?? 'Unknown holding'
  }, [positions])

  const notes = useMemo(
    () => exclusions(summary, needsSymbol, nameOf),
    [summary, needsSymbol, nameOf]
  )

  const startResolving = (instrument: Instrument) => {
    setResolving(instrument)
    setIsPickerOpen(true)
  }

  // The picker writes the symbol itself, so that a save it cannot complete is
  // reported inside the drawer the user is still looking at. Writing it again
  // here would put the same value through the CRDT twice.
  const symbolResolved = () => {
    setIsPickerOpen(false)
  }

  // Ranking the candidates needs a price the holding actually changed hands at,
  // on the day it changed hands: that pair is what tells a London USD listing
  // from the Xetra EUR one behind the same ISIN. Average cost carries no date,
  // so pairing it with today would compare a price paid last spring against
  // today's closes and rank on the difference between two days.
  const { trades } = useLiveTrades()
  const reference = useMemo(() => {
    if (!resolving) return undefined
    // Newest first, so this is the most recent buy that recorded a price.
    const buy = trades.find(
      trade =>
        trade.instrumentId === resolving._id &&
        trade.kind === 'buy' &&
        typeof trade.price === 'number' &&
        trade.price > 0
    )
    return buy?.price ? { price: buy.price, date: buy.date } : undefined
  }, [trades, resolving])

  const totals = { summary, baseCurrency }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Portfolio</h2>
          <p className="text-muted-foreground text-sm">
            {isLoading ? 'Valuing your holdings...' : `Valued at ${asOf.toLocaleDateString()}`}
          </p>
        </div>
        {!isLoading && positions.length > 0 && (
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {formatMoney(summary.marketValue)}{' '}
              <span className="text-muted-foreground text-sm font-normal">{baseCurrency}</span>
            </div>
            <div className={`text-sm font-medium tabular-nums ${gainClass(summary.totalReturn)}`}>
              {formatSignedMoney(summary.totalReturn)} total return
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <PositionsSkeleton />
      ) : positions.length === 0 ? (
        <EmptyPositions />
      ) : (
        <>
          {notes.length > 0 && (
            <div className="space-y-1">
              {notes.map(note => (
                <p key={note} className="text-muted-foreground text-xs">
                  {note}
                </p>
              ))}
            </div>
          )}

          {open.length > 0 ? (
            <Holdings
              rows={open}
              isMobile={isMobile}
              onResolveSymbol={startResolving}
              totals={isMobile ? undefined : totals}
              label="Open holdings"
            />
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              Nothing is held right now — every holding below has been sold.
            </p>
          )}

          {(isMobile || open.length === 0) && <TotalsCard {...totals} />}

          {closed.length > 0 && (
            <Collapsible open={showClosed} onOpenChange={setShowClosed}>
              <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg border px-4 py-2 text-sm transition-colors">
                <span>
                  Closed holdings{' '}
                  <span className="text-muted-foreground">({closed.length})</span>
                </span>
                {showClosed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Holdings
                  rows={closed}
                  isMobile={isMobile}
                  onResolveSymbol={startResolving}
                  label="Closed holdings"
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {resolving && (
        <SymbolPicker
          instrument={resolving}
          open={isPickerOpen}
          onOpenChange={setIsPickerOpen}
          onResolve={symbolResolved}
          reference={reference}
        />
      )}
    </section>
  )
}
