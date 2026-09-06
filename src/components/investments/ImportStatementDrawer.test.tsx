import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImportStatementDrawer } from './ImportStatementDrawer'
import { parseStatement } from '@/lib/import'
import { formatMoney } from '@/lib/format-money'
import {
  DEGIRO_FIXTURE,
  REVOLUT_FIXTURE,
  expectedDegiroCashBalance,
  expectedDegiroDepositTotal,
  expectedDegiroInstrumentCount,
  expectedDegiroNonInstrumentIsin,
  expectedDegiroRowCounts,
  expectedDegiroRowTotal,
} from '@/lib/import/__fixtures__/expected'
import type { ImportTradeRow, ImportTradesSummary } from '@/services/investmentService'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'
import type { Trade } from '../../../shared/schemas/trade.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

// jsdom ships no PointerEvent, and Base UI's checkbox constructs one so the
// click it dispatches carries the modifier keys.
if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as unknown as typeof window.PointerEvent
}

// jsdom's Blob has no text(), which is how the drawer reads the picked file in
// every browser the app runs in. FileReader, which jsdom does implement, gives
// the same result.
if (!Blob.prototype.text) {
  Blob.prototype.text = function readAsText(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}

const FIXTURES = join(__dirname, '../../lib/import/__fixtures__')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

function csvFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/csv' })
}

const emptySummary: ImportTradesSummary = {
  inserted: 0,
  alreadyImported: 0,
  duplicateWithinFile: 0,
  invalid: [],
}

const mocks = vi.hoisted(() => ({
  trades: [] as Trade[],
  wallets: [] as Wallet[],
  balances: new Map<string, number>(),
  findOrCreateInstrument: vi.fn(),
  importTrades: vi.fn(),
}))

vi.mock('@/hooks/useLiveTrades', () => ({
  useLiveTrades: () => ({ trades: mocks.trades, isLoading: false }),
}))

vi.mock('@/hooks/useLiveWallets', () => ({
  useLiveWallets: () => ({ wallets: mocks.wallets, isLoading: false }),
}))

vi.mock('@/hooks/useWalletBalances', () => ({
  useWalletBalances: () => ({ balances: mocks.balances, isLoading: false }),
}))

vi.mock('@/services/investmentService', () => ({
  investmentService: {
    findOrCreateInstrument: mocks.findOrCreateInstrument,
    importTrades: mocks.importTrades,
  },
}))

const CASH_WALLET: Wallet = {
  _id: 'w-broker',
  type: 'wallet',
  name: 'Broker cash',
  currency: 'EUR',
  initialBalance: 0,
  isSavings: false,
  order: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const ACCOUNT: BrokerAccount = {
  _id: 'acc-1',
  type: 'brokerAccount',
  name: 'DEGIRO',
  broker: 'degiro',
  cashWalletId: CASH_WALLET._id,
  order: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

function renderDrawer() {
  return render(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)
}

/** The rows a default import of the DeGiro fixture stores, as this account would already hold them. */
function alreadyImportedDegiroRows(): Trade[] {
  const statement = parseStatement(fixture(DEGIRO_FIXTURE)).statement!
  return statement.rows
    .filter(row => row.kind === 'buy' || row.kind === 'fee' || row.kind === 'interest')
    .map(row => ({ externalId: row.externalId, amount: row.amount, currency: row.currency }) as Trade)
}

/** fireEvent's shorthand does not return the event, and these assert on defaultPrevented. */
function createDragEvent(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['Files'], dropEffect: 'none' } })
  return event
}

async function uploadFixture(name: string) {
  const user = userEvent.setup()
  await user.upload(screen.getByLabelText('Statement CSV file'), csvFile(name, fixture(name)))
  return user
}

function importedRows(): ImportTradeRow[] {
  return mocks.importTrades.mock.calls[0][1] as ImportTradeRow[]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.trades = []
  mocks.wallets = [CASH_WALLET]
  mocks.balances = new Map([[CASH_WALLET._id, expectedDegiroDepositTotal]])
  mocks.findOrCreateInstrument.mockImplementation(async (data: { isin?: string; ticker?: string }) => ({
    _id: `inst-${data.isin ?? data.ticker}`,
  }))
  mocks.importTrades.mockResolvedValue(emptySummary)

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('choosing a file', () => {
  it('promises the statement never leaves the device', () => {
    renderDrawer()

    expect(screen.getByText(/read here in your browser/)).toBeInTheDocument()
    expect(screen.getByText(/never leaves this device/)).toBeInTheDocument()
  })

  it('names the formats it can read when the file is not one of them', async () => {
    renderDrawer()
    const user = userEvent.setup()

    await user.upload(
      screen.getByLabelText('Statement CSV file'),
      csvFile('bank.csv', 'Date,Description,Amount\n2024-01-04,Coffee,-3.50\n')
    )

    expect(await screen.findByText('That file was not recognised')).toBeInTheDocument()
    expect(screen.getByText(/does not look like a statement from DEGIRO and Revolut/)).toBeInTheDocument()
    expect(screen.getByText(/Account.csv/)).toBeInTheDocument()
  })
})

describe('previewing a DeGiro statement', () => {
  it('accounts for every row in the file', async () => {
    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    expect(
      await screen.findByText(`${expectedDegiroRowTotal} rows read from your DEGIRO statement.`)
    ).toBeInTheDocument()
  })

  it('shows the internal transfers as excluded rather than hiding them', async () => {
    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    expect(
      await screen.findByText(`${expectedDegiroRowCounts.internal} rows · never imported`)
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Internal transfers' })).not.toBeInTheDocument()
  })

  it('ticks the broker-side rows and leaves the deposits out', async () => {
    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    expect(await screen.findByRole('checkbox', { name: 'Buys' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Fees' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Deposits' })).not.toBeChecked()
  })

  it('offers to import exactly the rows those groups hold', async () => {
    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    const selected =
      expectedDegiroRowCounts.buy + expectedDegiroRowCounts.fee + expectedDegiroRowCounts.interest
    expect(await screen.findByRole('button', { name: `Import ${selected} rows` })).toBeInTheDocument()
  })

  // The ledger the panel compares against is the wallet's own balance plus the
  // rows this import would add, measured against what the file itself accounts
  // for - which is every row but the internal ones, not the statement's last
  // Balance column.
  it('measures the wallet against what the file accounts for', async () => {
    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    expect(await screen.findByText('Broker cash today')).toBeInTheDocument()
    expect(screen.getByText('Broker cash today').nextSibling).toHaveTextContent(
      formatMoney(expectedDegiroDepositTotal)
    )
    // DeGiro states its own closing balance, so that is what the wallet is
    // measured against rather than the sum of the rows. For an export reaching
    // back to the account's first day the two agree; for a date-filtered one
    // only the stated figure is right.
    expect(screen.getByText(/says the account holds/).nextSibling).toHaveTextContent(
      formatMoney(expectedDegiroCashBalance.EUR)
    )
    // Every deposit in the file is already in the wallet, so whatever gap is
    // left comes from elsewhere and ticking the deposits would widen it by the
    // whole 36,230.00.
    expect(screen.queryByRole('button', { name: 'Include the deposits' })).not.toBeInTheDocument()
  })

  // The wallet is in EUR and the statement's PLN rows move nothing, so there is
  // no PLN balance to measure against and no adjustment to advise.
  it('refuses to reconcile a wallet the statement is not denominated in', async () => {
    mocks.wallets = [{ ...CASH_WALLET, currency: 'PLN' }]
    mocks.balances = new Map([[CASH_WALLET._id, 1200]])

    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    expect(
      await screen.findByText('Nothing here to reconcile against Broker cash')
    ).toBeInTheDocument()
    expect(screen.queryByText('Balance after import')).not.toBeInTheDocument()
    expect(screen.queryByText(/opening balance by/)).not.toBeInTheDocument()
  })
})

describe('a second upload of an overlapping statement', () => {
  it('separates what is new from what is already imported', async () => {
    const statement = parseStatement(fixture(DEGIRO_FIXTURE)).statement!
    const buys = statement.rows.filter(row => row.kind === 'buy')
    mocks.trades = buys.map(row => ({ externalId: row.externalId, amount: row.amount, currency: row.currency }) as Trade)

    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    const stillNew = expectedDegiroRowCounts.fee + expectedDegiroRowCounts.interest
    expect(
      await screen.findByText(`${stillNew} to import, ${expectedDegiroRowCounts.buy} already imported`)
    ).toBeInTheDocument()
  })

  // The confirm button has to count what would actually be stored, or a user
  // re-uploading the same export is invited to import 46 rows that all exist.
  it('offers only the rows that are not already stored', async () => {
    mocks.trades = alreadyImportedDegiroRows().filter((_, index) => index % 2 === 0)

    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    const stored = mocks.trades.length
    const selected =
      expectedDegiroRowCounts.buy + expectedDegiroRowCounts.fee + expectedDegiroRowCounts.interest
    expect(
      await screen.findByRole('button', { name: `Import ${selected - stored} rows` })
    ).toBeInTheDocument()
  })

  it('has nothing to offer when the whole file is already stored', async () => {
    mocks.trades = alreadyImportedDegiroRows()

    renderDrawer()
    await uploadFixture(DEGIRO_FIXTURE)

    const button = await screen.findByRole('button', { name: 'Nothing new to import' })
    expect(button).toBeDisabled()
  })
})

describe('confirming the import', () => {
  it('sends the selected rows and no internal ones', async () => {
    renderDrawer()
    const user = await uploadFixture(DEGIRO_FIXTURE)

    await user.click(await screen.findByRole('button', { name: /^Import \d+ rows$/ }))

    await waitFor(() => expect(mocks.importTrades).toHaveBeenCalledTimes(1))
    expect(mocks.importTrades.mock.calls[0][0]).toBe(ACCOUNT._id)

    const rows = importedRows()
    expect(rows).toHaveLength(
      expectedDegiroRowCounts.buy + expectedDegiroRowCounts.fee + expectedDegiroRowCounts.interest
    )
    expect([...new Set(rows.map(row => row.kind))].sort()).toEqual(['buy', 'fee', 'interest'])
  })

  it('resolves one instrument per holding and never the broker cash account', async () => {
    renderDrawer()
    const user = await uploadFixture(DEGIRO_FIXTURE)

    await user.click(await screen.findByRole('button', { name: /^Import \d+ rows$/ }))

    await waitFor(() =>
      expect(mocks.findOrCreateInstrument).toHaveBeenCalledTimes(expectedDegiroInstrumentCount)
    )
    for (const call of mocks.findOrCreateInstrument.mock.calls) {
      expect(call[0].isin).not.toBe(expectedDegiroNonInstrumentIsin)
    }
    expect(importedRows().filter(row => row.instrumentId).length).toBeGreaterThan(0)
  })

  it('reports each bucket of the summary rather than one number', async () => {
    mocks.importTrades.mockResolvedValue({
      inserted: 12,
      alreadyImported: 92,
      duplicateWithinFile: 3,
      invalid: [{ index: 4, reason: 'date: Required' }],
    } satisfies ImportTradesSummary)

    renderDrawer()
    const user = await uploadFixture(DEGIRO_FIXTURE)

    await user.click(await screen.findByRole('button', { name: /^Import \d+ rows$/ }))

    expect(await screen.findByText('12 rows added to DEGIRO')).toBeInTheDocument()
    expect(screen.getByText('Imported').closest('div')?.parentElement).toHaveTextContent('12')
    expect(screen.getByText('Already imported').closest('div')?.parentElement).toHaveTextContent('92')
    expect(screen.getByText('Repeated in the file').closest('div')?.parentElement).toHaveTextContent('3')
    expect(screen.getByText('Row 5: date: Required')).toBeInTheDocument()
  })

  // The page keeps the drawer mounted so it can animate out, so without a reset
  // the next import opens on the last one's result screen.
  it('reads a statement dropped onto the zone, not only one picked through the dialog', async () => {
    render(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)
    const zone = screen.getByText('Drop the CSV your broker exported, or choose it.').parentElement!
    const file = csvFile(DEGIRO_FIXTURE, fixture(DEGIRO_FIXTURE))

    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })

    expect(await screen.findByText(/rows read from your DEGIRO statement/)).toBeInTheDocument()
  })

  it('cancels the drag events, because the browser would otherwise navigate away from the page', () => {
    render(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)
    const zone = screen.getByText('Drop the CSV your broker exported, or choose it.').parentElement!

    const dragOver = createDragEvent('dragover')
    const drop = createDragEvent('drop')
    fireEvent(zone, dragOver)
    fireEvent(zone, drop)

    // Without preventDefault on BOTH, dropping a file makes the browser open it
    // and throw the page away mid-import.
    expect(dragOver.defaultPrevented).toBe(true)
    expect(drop.defaultPrevented).toBe(true)
  })

  it('lights the zone up while a file is over it, and settles again when it leaves', () => {
    render(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)
    const zone = screen.getByText('Drop the CSV your broker exported, or choose it.').parentElement!

    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['Files'] } })
    expect(screen.getByText('Drop it here.')).toBeInTheDocument()

    fireEvent.dragLeave(zone, { dataTransfer: { files: [], types: ['Files'] } })
    expect(screen.getByText('Drop the CSV your broker exported, or choose it.')).toBeInTheDocument()
  })

  it('ignores a drag passing over the icon inside the zone', () => {
    // dragleave fires on the parent when the pointer crosses a child, so a naive
    // handler drops the highlight while the file is still over the zone.
    render(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)
    const zone = screen.getByText('Drop the CSV your broker exported, or choose it.').parentElement!
    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['Files'] } })

    // jsdom does not implement DragEvent, and relatedTarget does not survive
    // fireEvent's init object, so the event is built by hand.
    const leave = createDragEvent('dragleave')
    Object.defineProperty(leave, 'relatedTarget', { value: zone.firstChild })
    fireEvent(zone, leave)

    expect(screen.getByText('Drop it here.')).toBeInTheDocument()
  })

  it('does nothing when a drop carries no file', () => {
    render(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)
    const zone = screen.getByText('Drop the CSV your broker exported, or choose it.').parentElement!

    fireEvent.drop(zone, { dataTransfer: { files: [], types: ['Files'] } })

    expect(screen.getByText('Drop the CSV your broker exported, or choose it.')).toBeInTheDocument()
  })

  it('starts again from the file picker the next time it is opened', async () => {
    const { rerender } = render(
      <ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />
    )
    const user = await uploadFixture(DEGIRO_FIXTURE)
    await user.click(await screen.findByRole('button', { name: /^Import \d+ rows$/ }))
    expect(await screen.findByText(/rows added to DEGIRO/)).toBeInTheDocument()

    rerender(<ImportStatementDrawer account={ACCOUNT} open={false} onOpenChange={vi.fn()} />)
    rerender(<ImportStatementDrawer account={ACCOUNT} open onOpenChange={vi.fn()} />)

    expect(await screen.findByText('Drop the CSV your broker exported, or choose it.')).toBeInTheDocument()
    expect(screen.queryByText(/rows added to DEGIRO/)).not.toBeInTheDocument()
  })
})

describe('previewing a Revolut statement', () => {
  it('matches its holdings on ticker, because Revolut states no ISIN', async () => {
    mocks.wallets = []
    renderDrawer()
    await uploadFixture(REVOLUT_FIXTURE)

    expect(await screen.findByText(/rows read from your Revolut statement/)).toBeInTheDocument()
    expect(screen.getByText(/no ISIN - Revolut statements never state one/)).toBeInTheDocument()
  })

  it('says what is missing when no cash wallet is linked', async () => {
    mocks.wallets = []
    renderDrawer()
    await uploadFixture(REVOLUT_FIXTURE)

    expect(await screen.findByText('No cash wallet is linked to this account')).toBeInTheDocument()
  })
})
