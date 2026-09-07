import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SymbolPicker } from './SymbolPicker'
import { PositionCard, PositionRow } from './PositionRow'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLiveTrades } from '@/hooks/useLiveTrades'
import type { PortfolioPosition, UsePortfolioResult } from '@/hooks/usePortfolio'
import type { PortfolioSummary } from '@/lib/positions'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

/** Exactly what usePortfolio() hands back, so the page can spread it in. */
export type PositionsTableProps = UsePortfolioResult

/**
 * Six columns rather than nine, because each money column carries its total
 * over the per-share figure underneath it: what went in over what a share cost,
 * what it is worth over what a share closed at, the whole return over the
 * percentage it works out to.
 */
const COLUMNS = [
  { key: 'instrument', label: 'Holding', align: 'text-left' },
  { key: 'quantity', label: 'Quantity', align: 'text-right' },
  { key: 'invested', label: 'Invested', sub: 'per share', align: 'text-right' },
  { key: 'value', label: 'Value', sub: 'per share', align: 'text-right' },
  { key: 'return', label: 'Return', sub: '% of cost', align: 'text-right' },
  { key: 'allocation', label: 'Allocation', align: 'text-right' },
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

interface HoldingsProps {
  rows: PortfolioPosition[]
  isMobile: boolean
  onResolveSymbol: (instrument: Instrument) => void
  /** What each holding's share of the portfolio is measured against. */
  portfolioValue: number
  label: string
}

function Holdings({ rows, isMobile, onResolveSymbol, portfolioValue, label }: HoldingsProps) {
  if (isMobile) {
    return (
      <div className="space-y-2">
        {rows.map(position => (
          <PositionCard
            key={position.instrumentId}
            position={position}
            onResolveSymbol={onResolveSymbol}
            portfolioValue={portfolioValue}
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
              <TableHead key={column.key} className={`${column.align} h-auto py-2`}>
                {column.label}
                {'sub' in column && (
                  <span className="text-muted-foreground block text-xs font-normal">
                    {column.sub}
                  </span>
                )}
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
              portfolioValue={portfolioValue}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function PositionsTable({
  positions,
  summary,
  needsSymbol,
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
  const trades = useLiveTrades()
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

  return (
    <section className="space-y-4" aria-label="Holdings">
      {positions.length === 0 ? (
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
              portfolioValue={summary.marketValue}
              label="Open holdings"
            />
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              Nothing is held right now — every holding below has been sold.
            </p>
          )}

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
                  portfolioValue={summary.marketValue}
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
