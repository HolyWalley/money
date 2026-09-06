import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatMoney, formatPrice } from '@/lib/format-money'
import { formatQuantity } from './PositionRow'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLiveBrokerAccounts } from '@/hooks/useLiveBrokerAccounts'
import { useLiveInstruments } from '@/hooks/useLiveInstruments'
import { useLiveTrades } from '@/hooks/useLiveTrades'
import type { DailyConverter } from '@/lib/portfolio-history'
import type { Trade, TradeKind } from '../../../shared/schemas/trade.schema'

/**
 * How many rows are shown before the list has to be asked for more.
 *
 * Small on purpose: this sits under everything else on the page, and what is
 * wanted at a glance is the last few things that happened, not a ledger.
 */
const PAGE_SIZE = 10

const KIND_LABELS: Record<TradeKind, string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  fee: 'Fee',
  interest: 'Interest',
  adjustment: 'Adjustment',
}

/**
 * A colour per kind, so a statement is read by its shape before it is read at
 * all: what was bought, what it cost, what it paid out.
 */
const KIND_STYLES: Record<TradeKind, string> = {
  buy: 'bg-green-600/15 text-green-700 dark:bg-green-400/15 dark:text-green-400',
  sell: 'bg-violet-600/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-400',
  dividend: 'bg-blue-600/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-400',
  fee: 'bg-red-600/15 text-red-700 dark:bg-red-400/15 dark:text-red-400',
  interest: 'bg-amber-500/20 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400',
  adjustment: 'bg-muted text-muted-foreground',
}

// UTC throughout, because that is what the statements were read in: a DeGiro
// row timed 15:43 is 15:43 on the statement, not whatever that becomes in the
// reader's own zone.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})

/**
 * A day, or a plain word where there is none.
 *
 * Intl throws on an unreadable date rather than returning anything, and a
 * statement row the parser could not place in time would take the whole ledger
 * down with it.
 */
function formatDay(date: Date): string {
  return Number.isNaN(date.getTime()) ? 'Undated' : dateFormat.format(date)
}

interface Row {
  trade: Trade
  title: string
  detail: string
  /** The amount in the base currency, or null where no rate reaches it. */
  base: number | null
  date: Date
}

export interface TransactionsCardProps {
  /** Each row is stated at the rate of the day it happened, not today's. */
  convertOn: DailyConverter
  baseCurrency: string | undefined
}

function KindBadge({ kind }: { kind: TradeKind }) {
  return (
    <Badge variant="outline" className={cn('border-transparent', KIND_STYLES[kind])}>
      {KIND_LABELS[kind]}
    </Badge>
  )
}

function When({ date }: { date: Date }) {
  // Midnight is what a date-only row parses to, and "12:00 AM" on every second
  // row is noise rather than information.
  const hasTime =
    !Number.isNaN(date.getTime()) && (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0)

  return (
    <div className="whitespace-nowrap">
      <div>{formatDay(date)}</div>
      {hasTime && <div className="text-muted-foreground text-xs">{timeFormat.format(date)}</div>}
    </div>
  )
}

function Amount({ row, baseCurrency }: { row: Row; baseCurrency: string | undefined }) {
  const { trade, base } = row
  // Nothing to restate when the row already settled in the base currency.
  const original = trade.currency === baseCurrency || base === null

  return (
    <div className="text-right whitespace-nowrap tabular-nums">
      <div>
        {formatMoney(base ?? trade.amount)}{' '}
        <span className="text-muted-foreground text-xs">
          {base === null ? trade.currency : baseCurrency}
        </span>
      </div>
      {!original && (
        <div className="text-muted-foreground text-xs">
          {formatMoney(trade.amount)} {trade.currency}
        </div>
      )}
    </div>
  )
}

/**
 * Everything the statements recorded, newest first.
 *
 * The holdings table says what is owned and the curve says what it did; this is
 * the ledger underneath both, and the only place a fee or a scrap of interest
 * is visible at all.
 */
export function TransactionsCard({ convertOn, baseCurrency }: TransactionsCardProps) {
  const trades = useLiveTrades()
  const instruments = useLiveInstruments()
  const brokerAccounts = useLiveBrokerAccounts()
  const [shown, setShown] = useState(PAGE_SIZE)
  const isMobile = useIsMobile()

  const rows = useMemo<Row[]>(() => {
    const instrumentNames = new Map(instruments.map(instrument => [instrument._id, instrument.name]))
    const accountNames = new Map(brokerAccounts.map(account => [account._id, account.name]))

    const listed = trades.map(trade => {
      const date = new Date(trade.date)
      const instrumentName = trade.instrumentId
        ? instrumentNames.get(trade.instrumentId)
        : undefined

      const details: string[] = []
      if (trade.price) details.push(`${formatPrice(trade.price)} per share`)
      if (instrumentName && trade.note) details.push(trade.note)
      const accountName = accountNames.get(trade.accountId)
      if (accountName) details.push(accountName)

      return {
        trade,
        title: instrumentName ?? trade.note ?? KIND_LABELS[trade.kind],
        detail: details.join(' · '),
        base: Number.isNaN(date.getTime()) ? null : convertOn(trade.amount, trade.currency, date),
        date,
      }
    })

    // Newest first, and sorted here rather than trusted from the query: the
    // first page is meant to be the last few things that happened, and which
    // ten those are is the whole point of showing ten.
    return listed.sort((a, b) => {
      const left = a.date.getTime()
      const right = b.date.getTime()
      // A row nobody can place in time goes last rather than to the top, where
      // NaN would otherwise leave it.
      if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1
      if (Number.isNaN(right)) return -1
      return right - left
    })
  }, [trades, instruments, brokerAccounts, convertOn])

  // Nothing has been imported yet, and an empty ledger says less than no ledger.
  if (rows.length === 0) return null

  const page = rows.slice(0, shown)

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Transactions">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">
          Transactions <span className="text-muted-foreground font-normal">({rows.length})</span>
        </h2>
      </div>

      {isMobile ? (
        <ul className="divide-y">
          {page.map(row => (
            <li key={row.trade._id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <KindBadge kind={row.trade.kind} />
                  <span className="text-muted-foreground text-xs">{formatDay(row.date)}</span>
                </div>
                <div className="truncate text-sm font-medium">{row.title}</div>
                {row.detail && (
                  <div className="text-muted-foreground truncate text-xs">{row.detail}</div>
                )}
              </div>
              <div className="text-sm">
                <Amount row={row} baseCurrency={baseCurrency} />
                {row.trade.quantity > 0 && (
                  <div className="text-muted-foreground text-right text-xs tabular-nums">
                    {formatQuantity(row.trade.quantity)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Table aria-label="Transactions">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.map(row => (
              <TableRow key={row.trade._id}>
                <TableCell className="align-top text-sm">
                  <When date={row.date} />
                </TableCell>
                <TableCell className="align-top">
                  <KindBadge kind={row.trade.kind} />
                </TableCell>
                <TableCell className="max-w-[24rem] align-top whitespace-normal">
                  <div className="font-medium">{row.title}</div>
                  {row.detail && (
                    <div className="text-muted-foreground text-xs">{row.detail}</div>
                  )}
                </TableCell>
                <TableCell className="align-top text-right tabular-nums">
                  {row.trade.quantity > 0 ? formatQuantity(row.trade.quantity) : ''}
                </TableCell>
                <TableCell className="align-top">
                  <Amount row={row} baseCurrency={baseCurrency} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {shown < rows.length && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShown(current => current + PAGE_SIZE)}
        >
          Show more ({rows.length - shown} left)
        </Button>
      )}
    </section>
  )
}
