import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, ShieldCheck } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_SELECTED_KINDS,
  ImportPreview,
  instrumentKeyOf,
  selectedRowsOf,
  statementInstruments,
  tradeKindOf,
  type CashWalletSummary,
} from './ImportPreview'
import { brokerName, parseStatement, supportedBrokers } from '@/lib/import'
import { brokerLabel } from './BrokerAccountForm'
import type { ParsedRow, ParsedRowKind, ParsedStatement } from '@/lib/import/types'
import { useLiveTrades } from '@/hooks/useLiveTrades'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { walletService } from '@/services/walletService'
import { useWalletBalances } from '@/hooks/useWalletBalances'
import { investmentService, type ImportTradeRow, type ImportTradesSummary } from '@/services/investmentService'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'

export interface ImportStatementDrawerProps {
  /**
   * Every account a statement could be imported into. The broker the file
   * names picks one of them, so the ordinary import never has to ask.
   */
  accounts: BrokerAccount[]
  /**
   * Preselected when the import was started from one account in particular,
   * which then stands whatever broker the file turns out to name.
   */
  account?: BrokerAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Stage = 'choose' | 'account' | 'preview' | 'done'

/** Trimmed, because a note is read in a list and a DeGiro line runs past 100 characters. */
const NOTE_LENGTH = 120

function noteFor(row: ParsedRow): string | undefined {
  switch (row.kind) {
    case 'deposit':
      return 'Deposit'
    case 'withdrawal':
      return 'Withdrawal'
    case 'unknown':
      return `Unrecognised statement row: ${row.raw.trim().slice(0, NOTE_LENGTH)}`
    // A cost names no holding to be listed under, so without the statement's
    // own words all it can be called is its kind - and "Interest" is what a
    // quarterly notice of nothing and a 5.00 promotional rebate both read as.
    case 'fee':
    case 'interest':
      return row.description?.slice(0, NOTE_LENGTH)
    default:
      return undefined
  }
}

function toTradeRow(row: ParsedRow, instrumentIds: ReadonlyMap<string, string>): ImportTradeRow {
  const key = instrumentKeyOf(row)

  return {
    instrumentId: key ? instrumentIds.get(key) : undefined,
    kind: tradeKindOf(row.kind),
    date: row.date,
    quantity: row.quantity ?? 0,
    price: row.price,
    amount: row.amount,
    currency: row.currency,
    fee: row.fee ?? 0,
    externalId: row.externalId,
    note: noteFor(row),
  }
}

/**
 * One instrument per ISIN, or per ticker where the statement gives no ISIN.
 *
 * Resolved one after another rather than in parallel: findOrCreateInstrument
 * matches against the Yjs document, and two overlapping calls for the same
 * holding would both find nothing and both create it.
 */
async function resolveInstruments(rows: readonly ParsedRow[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()

  for (const instrument of statementInstruments(rows)) {
    const created = await investmentService.findOrCreateInstrument({
      isin: instrument.isin,
      ticker: instrument.ticker,
      name: instrument.name,
      currency: instrument.currency,
      // Neither statement says whether a holding is a stock or an ETF, and
      // guessing from the name would be wrong often enough to matter.
      kind: 'other',
    })
    resolved.set(instrument.key, created._id)
  }

  return resolved
}

function SummaryLine({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <div>
        <dt className="inline font-medium">{label}</dt>
        {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
      </div>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

export function ImportStatementDrawer({
  accounts,
  account = null,
  open,
  onOpenChange,
}: ImportStatementDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('choose')
  const [accountId, setAccountId] = useState<string | null>(account?._id ?? null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [statement, setStatement] = useState<ParsedStatement | null>(null)
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<ParsedRowKind>>(
    () => new Set(DEFAULT_SELECTED_KINDS)
  )
  const [summary, setSummary] = useState<ImportTradesSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const target = accounts.find(candidate => candidate._id === accountId) ?? null

  const { trades } = useLiveTrades(target?._id)
  const { wallets } = useLiveWallets()
  const { balances } = useWalletBalances()

  const wallet = target?.cashWalletId ? wallets.find(candidate => candidate._id === target.cashWalletId) : undefined
  const cashWallet: CashWalletSummary | null = wallet
    ? {
        name: wallet.name,
        currency: wallet.currency,
        balance: balances.get(wallet._id) ?? 0,
        initialBalance: wallet.initialBalance,
      }
    : null

  // The page keeps this drawer mounted after it closes so it can animate out,
  // so a second import would otherwise open on the last one's results.
  useEffect(() => {
    if (!open) return
    setStage('choose')
    setAccountId(account?._id ?? null)
    setFileName(null)
    setStatement(null)
    setSelectedKinds(new Set(DEFAULT_SELECTED_KINDS))
    setSummary(null)
    setError(null)
    setIsBusy(false)
    setIsDragging(false)
  }, [open, account?._id])

  /**
   * Which account a parsed file belongs to, or null when only the user can say.
   *
   * An import started from one account's own menu stays there whatever the file
   * says. Otherwise the broker the statement names picks the account, and the
   * question is only put when that leaves a real choice - two DEGIRO accounts,
   * or a file from a broker none of them is set to.
   */
  const accountFor = (parsed: ParsedStatement): BrokerAccount | null => {
    if (target) return target

    const matching = accounts.filter(candidate => candidate.broker === parsed.broker)
    const candidates = matching.length > 0 ? matching : accounts
    return candidates.length === 1 ? candidates[0] : null
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cleared so that picking the same file again still fires a change event,
    // which is what a user does after fixing the export.
    event.target.value = ''
    if (!file) return
    await readFile(file)
  }

  const readFile = async (file: File) => {
    setIsBusy(true)
    setError(null)
    setFileName(file.name)

    try {
      const result = parseStatement(await file.text())
      if (!result.statement) {
        setStatement(null)
        setError(result.reason)
        return
      }
      setStatement(result.statement)
      setSelectedKinds(new Set(DEFAULT_SELECTED_KINDS))

      const chosen = accountFor(result.statement)
      if (chosen) setAccountId(chosen._id)
      setStage(chosen ? 'preview' : 'account')
    } catch {
      setStatement(null)
      setError('That file could not be read.')
    } finally {
      setIsBusy(false)
    }
  }

  // The browser's own default for a dropped file is to navigate to it, which
  // throws the page away along with everything on it - so dragover has to be
  // cancelled too, not just drop.
  const handleDragOver = (event: React.DragEvent) => {
    if (isBusy) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    // Dragging across a child fires dragleave on the parent, so a leave only
    // counts once the pointer is outside the zone itself.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragging(false)
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    if (isBusy) return

    const file = event.dataTransfer.files?.[0]
    if (!file) return
    await readFile(file)
  }

  // Moving the opening balance rather than inventing a transaction: the money
  // was there before the ledger began, so it belongs to the wallet's starting
  // point, not to a dated event that never happened.
  const adjustOpeningBalance = async (delta: number) => {
    if (!wallet) return
    setError(null)
    try {
      await walletService.updateWallet(wallet._id, { initialBalance: wallet.initialBalance + delta })
    } catch {
      setError(`${wallet.name}'s opening balance could not be changed.`)
    }
  }

  const toggleKind = (kind: ParsedRowKind, checked: boolean) => {
    setSelectedKinds(current => {
      const next = new Set(current)
      if (checked) next.add(kind)
      else next.delete(kind)
      return next
    })
  }

  const selectedRows = statement ? selectedRowsOf(statement.rows, selectedKinds) : []
  const storedIds = new Set(trades.map(trade => trade.externalId))
  const newRowCount = selectedRows.filter(row => !storedIds.has(row.externalId)).length

  const handleImport = async () => {
    if (!statement || !target) return

    setIsBusy(true)
    setError(null)

    try {
      const instrumentIds = await resolveInstruments(selectedRows)
      const result = await investmentService.importTrades(
        target._id,
        selectedRows.map(row => toTradeRow(row, instrumentIds))
      )
      setSummary(result)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed.')
    } finally {
      setIsBusy(false)
    }
  }

  const startOver = () => {
    setStage('choose')
    setStatement(null)
    setSummary(null)
    setFileName(null)
    setError(null)
    // Only an account the caller preselected survives: one worked out from the
    // last file must not decide where the next file goes.
    setAccountId(account?._id ?? null)
  }

  const pickAccount = (candidate: BrokerAccount) => {
    setAccountId(candidate._id)
    setStage('preview')
  }

  const describeImport = (): string => {
    // On the account stage the target is what is being changed, so naming it
    // there would answer the question the stage is asking.
    if (fileName) return target && stage !== 'account' ? `${fileName} → ${target.name}` : fileName
    if (target) return `Add trades to ${target.name} from a broker CSV.`
    return 'Add trades from a broker CSV, into the account it belongs to.'
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="[--drawer-inset:0.5rem] [--bleed:0px] rounded-xl">
        <div className="mx-auto w-full">
          <DrawerHeader>
            <DrawerTitle>Import statement</DrawerTitle>
            <DrawerDescription>
              {describeImport()}
              {stage === 'preview' && accounts.length > 1 && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="ml-2 h-auto p-0 align-baseline"
                  onClick={() => setStage('account')}
                >
                  Change account
                </Button>
              )}
            </DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[55vh] overflow-y-auto overscroll-contain px-4 pb-4 text-sm group-data-[swipe-direction=right]/drawer-popup:max-h-[calc(100dvh-14rem)]">
            {stage === 'choose' && (
              <div className="space-y-4">
                <div
                  onDragEnter={handleDragOver}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  data-dragging={isDragging || undefined}
                  className={cn(
                    'flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors',
                    isDragging ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <FileUp
                    className={cn('size-6', isDragging ? 'text-primary' : 'text-muted-foreground')}
                    aria-hidden="true"
                  />
                  <p className="text-muted-foreground">
                    {isDragging ? 'Drop it here.' : 'Drop the CSV your broker exported, or choose it.'}
                  </p>
                  <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
                    {isBusy ? 'Reading...' : 'Choose file'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    aria-label="Statement CSV file"
                    className="sr-only"
                    onChange={handleFile}
                  />
                </div>

                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    The file is read here in your browser. Nothing is uploaded, and your statement never leaves this
                    device.
                  </span>
                </p>

                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertTitle>That file was not recognised</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <section className="space-y-1">
                  <h3 className="text-xs font-medium">Supported statements</h3>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {supportedBrokers.map(broker => (
                      <li key={broker.broker}>
                        <span className="text-foreground">{broker.name}</span> — {broker.export}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {stage === 'account' && statement && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  {accounts.length === 0
                    ? 'Add a broker account first — an import has to land in one.'
                    : `This is a ${brokerName(statement.broker)} statement. Which account is it from?`}
                </p>
                <div className="space-y-2">
                  {accounts.map(candidate => (
                    <button
                      key={candidate._id}
                      type="button"
                      onClick={() => pickAccount(candidate)}
                      className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{candidate.name}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {brokerLabel(candidate.broker)}
                        </span>
                      </span>
                      {candidate.broker === statement.broker && (
                        <span className="text-muted-foreground shrink-0 text-xs">Matches this file</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stage === 'preview' && statement && target && (
              <div className="space-y-4">
                <ImportPreview
                  statement={statement}
                  existingTrades={trades}
                  selectedKinds={selectedKinds}
                  onToggleKind={toggleKind}
                  cashWallet={cashWallet}
                  onAdjustOpeningBalance={adjustOpeningBalance}
                />
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertTitle>The import failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {stage === 'done' && summary && target && (
              <div className="space-y-3">
                <Alert>
                  <CheckCircle2 aria-hidden="true" />
                  <AlertTitle>
                    {summary.inserted} {summary.inserted === 1 ? 'row' : 'rows'} added to {target.name}
                  </AlertTitle>
                </Alert>

                <dl className="space-y-1.5">
                  <SummaryLine label="Imported" value={summary.inserted} note="new rows on this account" />
                  <SummaryLine
                    label="Already imported"
                    value={summary.alreadyImported}
                    note="skipped, this account already had them"
                  />
                  <SummaryLine
                    label="Repeated in the file"
                    value={summary.duplicateWithinFile}
                    note="the statement stated them twice; imported once"
                  />
                  {summary.relabelled > 0 && (
                    <SummaryLine
                      label="Relabelled"
                      value={summary.relabelled}
                      note="already imported, and now carrying the words the statement gave them"
                    />
                  )}
                  <SummaryLine
                    label="Could not be read"
                    value={summary.invalid.length}
                    note="left out; the rest was imported anyway"
                  />
                </dl>

                {summary.invalid.length > 0 && (
                  <ul className="space-y-1 border-l-2 border-destructive/40 pl-3 text-xs text-destructive">
                    {summary.invalid.map(issue => (
                      <li key={`${issue.index}-${issue.externalId ?? ''}`}>
                        Row {issue.index + 1}: {issue.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DrawerFooter>
            {stage === 'account' && (
              <Button type="button" variant="outline" size="lg" onClick={startOver}>
                Choose another file
              </Button>
            )}

            {stage === 'preview' && (
              <>
                <Button type="button" size="lg" onClick={handleImport} disabled={isBusy || newRowCount === 0}>
                  {isBusy
                    ? 'Importing...'
                    : newRowCount === 0
                      ? 'Nothing new to import'
                      : `Import ${newRowCount} ${newRowCount === 1 ? 'row' : 'rows'}`}
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={startOver} disabled={isBusy}>
                  Choose another file
                </Button>
              </>
            )}

            {stage === 'done' && (
              <>
                <Button type="button" size="lg" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={startOver}>
                  Import another file
                </Button>
              </>
            )}

            {stage === 'choose' && (
              <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
