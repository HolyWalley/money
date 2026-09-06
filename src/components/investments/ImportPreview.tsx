import { useMemo } from 'react'
import { AlertTriangle, Ban, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatMoney, formatSignedMoney } from '@/lib/format-money'
import { brokerName } from '@/lib/import'
import type { ParsedRow, ParsedRowKind, ParsedStatement } from '@/lib/import/types'
import type { Trade } from '../../../shared/schemas/trade.schema'

/** Order the groups are shown in: holdings first, then cash, then what needs a decision. */
const GROUP_ORDER: readonly ParsedRowKind[] = [
  'buy', 'sell', 'dividend', 'interest', 'fee', 'deposit', 'withdrawal', 'unknown', 'internal',
]

/**
 * Everything but 'internal'. Broker plumbing moves money between the user's
 * own sub-accounts, so importing it would double every figure it touches -
 * there is no checkbox for it at all, only a count.
 */
const IMPORTABLE_KINDS: readonly ParsedRowKind[] = GROUP_ORDER.filter((kind) => kind !== 'internal')

/**
 * What is ticked when a statement is first read.
 *
 * Everything that happens inside the broker, because nothing else in the app
 * records it. Deposits and withdrawals are left out: they are money crossing
 * the broker boundary, which the user already records as an ordinary transfer,
 * so importing them counts it twice. Unrecognised rows are left out because
 * nobody has decided what they are yet.
 */
export const DEFAULT_SELECTED_KINDS: readonly ParsedRowKind[] = ['buy', 'sell', 'dividend', 'interest', 'fee']

const KIND_COPY: Record<ParsedRowKind, { title: string; blurb?: string }> = {
  buy: { title: 'Buys' },
  sell: { title: 'Sells' },
  dividend: { title: 'Dividends' },
  interest: { title: 'Interest' },
  fee: { title: 'Fees' },
  deposit: {
    title: 'Deposits',
    blurb: 'Money moving into the broker. Left out because you already record it as a transfer in your own ledger, and importing it would count the same money twice.',
  },
  withdrawal: {
    title: 'Withdrawals',
    blurb: 'Money moving out of the broker. Left out for the same reason as deposits: your own transfer already records it.',
  },
  unknown: {
    title: 'Unrecognised rows',
    blurb: 'No rule matched these. Each one is listed below with its own text, so an unfamiliar row is yours to decide on rather than quietly dropped.',
  },
  internal: {
    title: 'Internal transfers',
    blurb: 'The broker shuffling money between your own sub-accounts. These can never be imported - they would double every figure they touch - and are counted here so every row in the file is accounted for.',
  },
}

const TRADE_KIND_BY_ROW_KIND: Partial<Record<ParsedRowKind, Trade['kind']>> = {
  buy: 'buy',
  sell: 'sell',
  dividend: 'dividend',
  interest: 'interest',
  fee: 'fee',
}

interface CurrencyTotal {
  currency: string
  amount: number
}

interface PreviewGroup {
  kind: ParsedRowKind
  rows: ParsedRow[]
  /** How many of them this account already holds from an overlapping earlier import. */
  alreadyImported: number
  /** One total per currency: a statement that mixes EUR and PLN has no single sum. */
  totals: CurrencyTotal[]
  warned: ParsedRow[]
}

export interface StatementInstrument {
  /** How rows were grouped: the ISIN where the statement gives one, else the ticker. */
  key: string
  isin?: string
  ticker?: string
  name: string
  currency: string
}

export interface CashWalletSummary {
  name: string
  currency: string
  /**
   * What the wallet holds today: its opening balance, the user's own transfers,
   * and every row already imported onto the accounts it is the cash for.
   */
  balance: number
  /** Its current opening balance, which the reconciliation offers to correct. */
  initialBalance: number
}

export type ExistingTrade = Pick<Trade, 'externalId'>

export interface ImportPreviewProps {
  statement: ParsedStatement
  /**
   * The trades this account already holds, which is what makes a re-uploaded
   * statement read as "12 new, 92 already imported". Only their ids are wanted
   * here: their cash is already in the wallet's balance, which is derived from
   * them.
   */
  existingTrades: readonly ExistingTrade[]
  selectedKinds: ReadonlySet<ParsedRowKind>
  onToggleKind: (kind: ParsedRowKind, checked: boolean) => void
  /** The ordinary wallet holding this broker's cash, or null if none is linked. */
  cashWallet: CashWalletSummary | null
  /**
   * Moves the cash wallet's opening balance by `delta`. The remedy for an
   * account that held money before the ledger began, which no amount of
   * ticking rows can express.
   */
  onAdjustOpeningBalance: (delta: number) => void
}

/**
 * The ISIN a row names, or its ticker - matching the order findOrCreateInstrument
 * resolves in, so the preview lists exactly the instruments the import creates.
 */
export function instrumentKeyOf(row: Pick<ParsedRow, 'isin' | 'ticker'>): string | null {
  if (row.isin) return `isin:${row.isin}`
  if (row.ticker) return `ticker:${row.ticker}`
  return null
}

export function statementInstruments(rows: readonly ParsedRow[]): StatementInstrument[] {
  const byKey = new Map<string, StatementInstrument>()

  for (const row of rows) {
    const key = instrumentKeyOf(row)
    if (!key) continue

    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        key,
        isin: row.isin,
        ticker: row.ticker,
        // A dividend row names no product, so the name may only arrive with a
        // later row of the same holding.
        name: row.instrumentName ?? row.ticker ?? row.isin ?? 'Unnamed instrument',
        currency: row.currency,
      })
      continue
    }

    if (row.instrumentName && (existing.name === existing.ticker || existing.name === existing.isin)) {
      existing.name = row.instrumentName
    }
    if (!existing.ticker && row.ticker) existing.ticker = row.ticker
  }

  return [...byKey.values()]
}

export function selectedRowsOf(
  rows: readonly ParsedRow[],
  selectedKinds: ReadonlySet<ParsedRowKind>
): ParsedRow[] {
  return rows.filter((row) => IMPORTABLE_KINDS.includes(row.kind) && selectedKinds.has(row.kind))
}

/** The trade kind a row is stored as; anything with no direct equivalent is an adjustment. */
export function tradeKindOf(kind: ParsedRowKind): Trade['kind'] {
  return TRADE_KIND_BY_ROW_KIND[kind] ?? 'adjustment'
}

function totalsByCurrency(rows: readonly ParsedRow[]): CurrencyTotal[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount)
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

function groupRows(rows: readonly ParsedRow[], alreadyImported: ReadonlySet<string>): PreviewGroup[] {
  return GROUP_ORDER
    .map((kind) => {
      const kindRows = rows.filter((row) => row.kind === kind)
      return {
        kind,
        rows: kindRows,
        alreadyImported: kindRows.filter((row) => alreadyImported.has(row.externalId)).length,
        totals: totalsByCurrency(kindRows),
        warned: kindRows.filter((row) => row.warnings.length > 0),
      }
    })
    .filter((group) => group.rows.length > 0)
}

function sumIn(rows: readonly { amount: number; currency: string }[], currency: string): number {
  return rows.reduce((total, row) => (row.currency === currency ? total + row.amount : total), 0)
}

function formatCash(amount: number, currency: string): string {
  return `${formatSignedMoney(amount)} ${currency}`
}

/** The row's calendar day, taken from the ISO string rather than a Date, which would shift it by timezone. */
function rowDay(date: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : date
}

function rowSubject(row: ParsedRow): string {
  return row.instrumentName ?? row.ticker ?? row.isin ?? ''
}

function RowDetail({ row }: { row: ParsedRow }) {
  const subject = rowSubject(row)

  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-muted-foreground">{rowDay(row.date)}</span>
        <span className="tabular-nums">{formatCash(row.amount, row.currency)}</span>
      </div>
      {subject && <p className="break-words">{subject}</p>}
      <p className="break-all font-mono text-[0.6875rem] leading-snug text-muted-foreground">{row.raw.trim()}</p>
      {row.warnings.map((warning, index) => (
        // Destructive only where the row itself could not be read. A note on a
        // row that parsed fine - a total a couple of cents off the quantity
        // times the price, say - is the parser showing its working, and
        // colouring that like a failure teaches the reader to skip all of them,
        // including the one that matters.
        <p
          key={index}
          className={cn(
            'flex items-start gap-1.5',
            row.kind === 'unknown' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span className="break-words">{warning}</span>
        </p>
      ))}
    </li>
  )
}

function GroupCard({
  group,
  selected,
  onToggleKind,
}: {
  group: PreviewGroup
  selected: boolean
  onToggleKind: (kind: ParsedRowKind, checked: boolean) => void
}) {
  const copy = KIND_COPY[group.kind]
  const importable = IMPORTABLE_KINDS.includes(group.kind)
  const checkboxId = `import-kind-${group.kind}`
  // Unrecognised rows are shown one by one whatever they say: their whole
  // point is that no rule read them, so the row's own text is the only honest
  // description. Everything else shows only the rows the parser flagged.
  const detailed = group.kind === 'unknown' ? group.rows : group.warned

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-3">
        {importable ? (
          <Checkbox
            id={checkboxId}
            className="mt-0.5"
            checked={selected}
            onCheckedChange={(checked) => onToggleKind(group.kind, checked === true)}
          />
        ) : (
          <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            {importable ? (
              <Label htmlFor={checkboxId} className="cursor-pointer font-medium">
                {copy.title}
              </Label>
            ) : (
              <span className="font-medium">{copy.title}</span>
            )}
            <span className="text-xs tabular-nums text-muted-foreground">
              {group.totals.map((total) => formatCash(total.amount, total.currency)).join(' · ')}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {group.rows.length} {group.rows.length === 1 ? 'row' : 'rows'}
            {importable
              ? group.alreadyImported > 0 && ` · ${group.alreadyImported} already imported`
              : ' · never imported'}
          </p>

          {copy.blurb && <p className="text-xs text-muted-foreground">{copy.blurb}</p>}

          {detailed.length > 0 && (
            <ul className="mt-2 space-y-2 border-l-2 border-border pl-3 text-xs">
              {/* Keyed by position: a statement can state the same row twice, which the
                  parsers give one external id and a warning rather than two identities. */}
              {detailed.map((row, index) => (
                <RowDetail key={`${row.externalId}-${index}`} row={row} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}

function ReconciliationPanel({
  statement,
  newSelectedRows,
  cashWallet,
  onToggleKind,
  onAdjustOpeningBalance,
  depositsSelected,
}: {
  statement: ParsedStatement
  /** Only the rows a confirm would actually add - the rest are already in the wallet's balance. */
  newSelectedRows: readonly ParsedRow[]
  cashWallet: CashWalletSummary | null
  onAdjustOpeningBalance: (delta: number) => void
  onToggleKind: (kind: ParsedRowKind, checked: boolean) => void
  depositsSelected: boolean
}) {
  // Every row but the internal ones: the cash the statement itself accounts
  // for. It is the broker's closing balance only where the file covers the
  // account's whole history, which is why the label says what it sums.
  const statementRows = statement.rows.filter((row) => row.kind !== 'internal')

  if (!cashWallet) {
    const totals = totalsByCurrency(statementRows)
    return (
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>No cash wallet is linked to this account</AlertTitle>
        <AlertDescription>
          <p>
            The statement&apos;s rows add up to{' '}
            {totals.map((total) => formatCash(total.amount, total.currency)).join(' · ') || '0.00'}, but with no
            wallet holding this broker&apos;s cash there is nothing to compare it against. Link one on the account
            to reconcile the balance.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  const { currency } = cashWallet

  // A file that moves no cash in the wallet's own currency - a statement
  // denominated in another one, or an export whose date range caught no
  // activity - gives an `expected` of zero that is not the broker's balance but
  // the absence of one. Reconciling against it would confidently tell the user
  // to adjust their opening balance by everything the wallet holds.
  const accountsForWalletCurrency = statementRows.some(
    (row) => row.currency === currency && Math.abs(row.amount) >= 0.005
  )

  if (!accountsForWalletCurrency) {
    const totals = totalsByCurrency(statementRows).filter((total) => Math.abs(total.amount) >= 0.005)
    return (
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>Nothing here to reconcile against {cashWallet.name}</AlertTitle>
        <AlertDescription>
          <p>
            {totals.length === 0
              ? `This file moves no cash at all, so there is no balance to compare ${cashWallet.name} against.`
              : `This statement moves no ${currency}, and ${cashWallet.name} holds ${currency}. Its rows add up to ${totals
                  .map((total) => formatCash(total.amount, total.currency))
                  .join(' · ')}, so there is nothing here to measure it against.`}
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  const selectedCash = sumIn(newSelectedRows, currency)
  // The wallet's balance already answers for every row imported before now, so
  // only what a confirm would add is still to come.
  const computed = cashWallet.balance + selectedCash
  // The broker's own closing balance where it gives one, because summing the
  // rows only equals it for an export reaching back to the account's first day.
  // A statement filtered to one year sums to that year's change, and treating
  // that as the balance is wrong by everything before it.
  const stated = statement.statedBalances.find((balance) => balance.currency === currency)
  const expected = stated ? stated.amount : sumIn(statementRows, currency)
  const difference = expected - computed
  const matches = Math.abs(difference) < 0.005

  const transferTotal = sumIn(
    statement.rows.filter((row) => row.kind === 'deposit' || row.kind === 'withdrawal'),
    currency
  )
  // Offered only where it actually narrows the gap. A statement whose deposits
  // are all already recorded as transfers has a difference that comes from
  // somewhere else, and pointing at the deposits there would send the user the
  // wrong way by the whole deposit total.
  const includingDepositsHelps = !depositsSelected && Math.abs(difference - transferTotal) < Math.abs(difference)
  const excludingDepositsHelps = depositsSelected && Math.abs(difference + transferTotal) < Math.abs(difference)
  const otherCurrencies = totalsByCurrency(statementRows).filter(
    (total) => total.currency !== currency && Math.abs(total.amount) >= 0.005
  )

  const lines: Array<{ label: string; value: number }> = [
    { label: `${cashWallet.name} today`, value: cashWallet.balance },
    { label: 'Rows selected above', value: selectedCash },
  ]

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-medium">Reconciliation</h3>
        <span className="text-xs text-muted-foreground">{cashWallet.name} · {currency}</span>
      </div>

      <dl className="space-y-1 text-xs">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="tabular-nums">{formatSignedMoney(line.value)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-medium">
          <dt>Balance after import</dt>
          <dd className="tabular-nums">{formatMoney(computed)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            {stated ? `${brokerName(statement.broker)} says the account holds` : 'Statement adds up to'}
          </dt>
          <dd className="tabular-nums">{formatMoney(expected)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 font-medium">
          <dt>Difference</dt>
          <dd className="tabular-nums">
            {formatMoney(Math.abs(difference))}
            {matches ? '' : difference > 0 ? ' short' : ' over'}
          </dd>
        </div>
      </dl>

      {matches ? (
        <p className="text-xs text-muted-foreground">
          Your ledger lands exactly on what the statement accounts for.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {difference > 0
              ? `${cashWallet.name} will be ${formatMoney(difference)} ${currency} short of what the statement accounts for.`
              : `${cashWallet.name} will hold ${formatMoney(-difference)} ${currency} more than the statement accounts for.`}
            {includingDepositsHelps && (
              <> The {formatMoney(Math.abs(transferTotal))} {currency} of deposits and withdrawals in this file is
              not in your ledger as transfers of your own.</>
            )}
            {excludingDepositsHelps && (
              <> Your own transfers into {cashWallet.name} already record the deposits you have ticked, so importing
              them counts that money twice.</>
            )}
          </p>

          {includingDepositsHelps && (
            <Button type="button" size="sm" variant="outline" onClick={() => onToggleKind('deposit', true)}>
              Include the deposits
            </Button>
          )}

          {excludingDepositsHelps && (
            <Button type="button" size="sm" variant="outline" onClick={() => onToggleKind('deposit', false)}>
              Leave the deposits out
            </Button>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {includingDepositsHelps || excludingDepositsHelps ? 'Or set' : 'Set'} {cashWallet.name}&apos;s opening
              balance to {formatMoney(cashWallet.initialBalance + difference)} {currency}
              {' '}({formatSignedMoney(difference)} on today&apos;s {formatMoney(cashWallet.initialBalance)}) to bring
              it in line. That is the right move when the account held money before your ledger started: the
              statement reaches further back than your own transfers do.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAdjustOpeningBalance(difference)}
            >
              Set opening balance to {formatMoney(cashWallet.initialBalance + difference)} {currency}
            </Button>
            {!stated && (
              <p className="text-xs text-muted-foreground">
                {brokerName(statement.broker)} states no closing balance, so this assumes the export covers the
                account from the beginning. If you filtered it by date, it will be short by whatever came before.
              </p>
            )}
          </div>
        </div>
      )}

      {otherCurrencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not reconciled here: {otherCurrencies.map((total) => formatCash(total.amount, total.currency)).join(' · ')}.
          {' '}{cashWallet.name} is a {currency} wallet.
        </p>
      )}
    </section>
  )
}

export function ImportPreview({
  statement,
  existingTrades,
  selectedKinds,
  onToggleKind,
  cashWallet,
  onAdjustOpeningBalance,
}: ImportPreviewProps) {
  const alreadyImportedIds = useMemo(
    () => new Set(existingTrades.map((trade) => trade.externalId)),
    [existingTrades]
  )
  const groups = useMemo(() => groupRows(statement.rows, alreadyImportedIds), [statement, alreadyImportedIds])
  const selectedRows = useMemo(
    () => selectedRowsOf(statement.rows, selectedKinds),
    [statement, selectedKinds]
  )

  const newSelected = selectedRows.filter((row) => !alreadyImportedIds.has(row.externalId))
  const alreadySelected = selectedRows.length - newSelected.length
  const instruments = statementInstruments(newSelected)
  const withoutIsin = instruments.filter((instrument) => !instrument.isin)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm">
          {statement.rows.length} {statement.rows.length === 1 ? 'row' : 'rows'} read from your{' '}
          {brokerName(statement.broker)} statement.
        </p>
        <p className="text-sm font-medium">
          {newSelected.length} to import
          {alreadySelected > 0 && `, ${alreadySelected} already imported`}
        </p>
      </div>

      {statement.warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>The file itself raised {statement.warnings.length === 1 ? 'a problem' : 'problems'}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {statement.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <ul className="space-y-2">
        {groups.map((group) => (
          <GroupCard
            key={group.kind}
            group={group}
            selected={selectedKinds.has(group.kind)}
            onToggleKind={onToggleKind}
          />
        ))}
      </ul>

      {instruments.length > 0 && (
        <section className="space-y-1 rounded-lg border border-border p-3">
          <h3 className="font-medium">
            {instruments.length} {instruments.length === 1 ? 'instrument' : 'instruments'}
          </h3>
          <p className="text-xs text-muted-foreground">
            Matched against what you already hold, by ISIN first and then ticker, and created only where nothing
            matches.
          </p>
          <ul className="space-y-1 text-xs">
            {instruments.map((instrument) => (
              <li key={instrument.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="break-words">{instrument.name}</span>
                <span className="text-muted-foreground">{instrument.isin ?? instrument.ticker}</span>
              </li>
            ))}
          </ul>
          {withoutIsin.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {withoutIsin.length === instruments.length ? 'These carry' : 'Some of these carry'} no ISIN - Revolut
              statements never state one - so they are matched on ticker alone.
            </p>
          )}
        </section>
      )}

      <ReconciliationPanel
        statement={statement}
        newSelectedRows={newSelected}
        cashWallet={cashWallet}
        onToggleKind={onToggleKind}
        onAdjustOpeningBalance={onAdjustOpeningBalance}
        depositsSelected={selectedKinds.has('deposit')}
      />
    </div>
  )
}
