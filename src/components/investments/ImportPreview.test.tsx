import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SELECTED_KINDS,
  ImportPreview,
  type CashWalletSummary,
  type ExistingTrade,
} from './ImportPreview'
import { formatMoney } from '@/lib/format-money'
import type { ParsedRow, ParsedRowKind, ParsedStatement } from '@/lib/import/types'

// jsdom ships no PointerEvent, and Base UI's checkbox constructs one so the
// click it dispatches carries the modifier keys.
if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as unknown as typeof window.PointerEvent
}

function makeRow(row: Pick<ParsedRow, 'kind' | 'amount' | 'externalId'> & Partial<ParsedRow>): ParsedRow {
  return {
    // Late enough in the UTC day that any conversion through a local Date would
    // move the calendar day the preview prints.
    date: '2025-03-04T23:30:00.000Z',
    currency: 'EUR',
    raw: `raw line for ${row.externalId}`,
    warnings: [],
    ...row,
  }
}

/**
 * A statement whose arithmetic is small enough to check by eye.
 *
 * Non-internal rows net to 1,009.00: the 2,000.00 of deposits, less the
 * 1,000.00 buy and its 3.00 commission, plus a 12.00 dividend. The unfamiliar
 * row moves no cash, exactly as Revolut's parser leaves one it cannot read.
 */
function makeStatement(overrides: Partial<ParsedStatement> = {}): ParsedStatement {
  return {
    broker: 'degiro',
    currencies: ['EUR'],
    warnings: [],
    statedBalances: [],
    rows: [
      makeRow({
        kind: 'buy',
        amount: -1000,
        externalId: 'buy-1',
        isin: 'IE0001',
        instrumentName: 'World ETF',
        quantity: 100,
        price: 10,
        raw: 'Kupno 100 World ETF@10,00 EUR (IE0001)',
        warnings: ['Description says 100 but the cash amount implies 99.98'],
      }),
      makeRow({ kind: 'fee', amount: -3, externalId: 'fee-1', isin: 'IE0001', instrumentName: 'World ETF' }),
      makeRow({ kind: 'dividend', amount: 12, externalId: 'div-1', isin: 'IE0001', instrumentName: 'World ETF' }),
      makeRow({ kind: 'deposit', amount: 1500, externalId: 'dep-1' }),
      makeRow({ kind: 'deposit', amount: 500, externalId: 'dep-2' }),
      makeRow({ kind: 'internal', amount: -400, externalId: 'int-1', raw: 'Degiro Cash Sweep Transfer' }),
      makeRow({ kind: 'internal', amount: 400, externalId: 'int-2', raw: 'Transfer to your Cash Account' }),
      makeRow({
        kind: 'unknown',
        amount: 0,
        externalId: 'unk-1',
        raw: 'Promocja rabat',
        warnings: ['No rule matched this description, so it was left unclassified'],
      }),
    ],
    ...overrides,
  }
}

const RECORDED_EVERY_DEPOSIT: CashWalletSummary = { name: 'Broker cash', currency: 'EUR', initialBalance: 0, balance: 2000 }
const RECORDED_NO_DEPOSIT: CashWalletSummary = { name: 'Broker cash', currency: 'EUR', initialBalance: 0, balance: 0 }

function Harness({
  statement = makeStatement(),
  existingTrades = [],
  cashWallet = RECORDED_EVERY_DEPOSIT,
  onAdjustOpeningBalance = () => {},
}: {
  statement?: ParsedStatement
  existingTrades?: ExistingTrade[]
  cashWallet?: CashWalletSummary | null
  onAdjustOpeningBalance?: (delta: number) => void
}) {
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<ParsedRowKind>>(
    () => new Set(DEFAULT_SELECTED_KINDS)
  )

  return (
    <ImportPreview
      statement={statement}
      existingTrades={existingTrades}
      selectedKinds={selectedKinds}
      cashWallet={cashWallet}
      onAdjustOpeningBalance={onAdjustOpeningBalance}
      onToggleKind={(kind, checked) =>
        setSelectedKinds(current => {
          const next = new Set(current)
          if (checked) next.add(kind)
          else next.delete(kind)
          return next
        })
      }
    />
  )
}

describe('ImportPreview defaults', () => {
  it('ticks everything that happens inside the broker', () => {
    render(<Harness />)

    expect(screen.getByRole('checkbox', { name: 'Buys' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Fees' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dividends' })).toBeChecked()
  })

  it('leaves deposits unticked and says why', () => {
    render(<Harness />)

    expect(screen.getByRole('checkbox', { name: 'Deposits' })).not.toBeChecked()
    expect(screen.getByText(/count the same money twice/)).toBeInTheDocument()
  })

  it('leaves unrecognised rows unticked', () => {
    render(<Harness />)

    expect(screen.getByRole('checkbox', { name: 'Unrecognised rows' })).not.toBeChecked()
  })

  it('counts and totals each group', () => {
    render(<Harness />)

    expect(screen.getByText('-3.00 EUR')).toBeInTheDocument()
    expect(screen.getByText('+12.00 EUR')).toBeInTheDocument()
    expect(screen.getByText('+2,000.00 EUR')).toBeInTheDocument()
  })

  // A DeGiro account holds cash in more than one currency, so a group can mix
  // them and a single sum of the two would be a number that means nothing.
  it('totals a mixed-currency group once per currency rather than as one sum', () => {
    render(
      <Harness
        statement={makeStatement({
          rows: [
            makeRow({ kind: 'interest', amount: 4, externalId: 'int-eur', currency: 'EUR' }),
            makeRow({ kind: 'interest', amount: 9, externalId: 'int-pln', currency: 'PLN' }),
          ],
        })}
        cashWallet={{ name: 'Broker cash', currency: 'EUR', initialBalance: 0, balance: 0 }}
      />
    )

    expect(screen.getByText('+4.00 EUR · +9.00 PLN')).toBeInTheDocument()
    expect(screen.queryByText('+13.00 EUR')).not.toBeInTheDocument()
  })

  it('ticks sells and leaves withdrawals out', () => {
    render(
      <Harness
        statement={makeStatement({
          rows: [
            makeRow({ kind: 'sell', amount: 900, externalId: 'sell-1', isin: 'IE0001' }),
            makeRow({ kind: 'withdrawal', amount: -400, externalId: 'wd-1' }),
          ],
        })}
        cashWallet={{ name: 'Broker cash', currency: 'EUR', initialBalance: 0, balance: -400 }}
      />
    )

    expect(screen.getByRole('checkbox', { name: 'Sells' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Withdrawals' })).not.toBeChecked()
    expect(screen.getByText(/your own transfer already records it/)).toBeInTheDocument()
  })

  // Taken from the ISO string: reading it through a local Date prints the wrong
  // calendar day for anyone east or west of UTC.
  it('prints a row on the day the statement dated it', () => {
    render(<Harness />)

    // The warned buy and the unrecognised row, each dated the same day.
    expect(screen.getAllByText('2025-03-04')).toHaveLength(2)
  })
})

describe('ImportPreview and rows that cannot be imported', () => {
  it('shows the internal transfers but offers no way to import them', () => {
    render(<Harness />)

    expect(screen.getByText('Internal transfers')).toBeInTheDocument()
    expect(screen.getByText('2 rows · never imported')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Internal transfers' })).not.toBeInTheDocument()
  })

  it('accounts for every row in the file', () => {
    render(<Harness />)

    expect(screen.getByText(/8 rows read from your DEGIRO statement/)).toBeInTheDocument()
  })

  it('prints an unrecognised row with its own text rather than dropping it', () => {
    render(<Harness />)

    expect(screen.getByText('Promocja rabat')).toBeInTheDocument()
  })
})

describe('ImportPreview warnings', () => {
  it('surfaces a per-row warning from the parser', () => {
    render(<Harness />)

    expect(
      screen.getByText('Description says 100 but the cash amount implies 99.98')
    ).toBeInTheDocument()
  })

  it('surfaces the statement-level warnings', () => {
    render(<Harness statement={makeStatement({ warnings: ['No DeGiro header found'] })} />)

    expect(screen.getByText('No DeGiro header found')).toBeInTheDocument()
  })
})

describe('ImportPreview reconciliation', () => {
  it('lands exactly on the statement when every deposit is already in the ledger', () => {
    render(<Harness />)

    expect(screen.getByText('Balance after import').nextSibling).toHaveTextContent('1,009.00')
    expect(screen.getByText('Statement adds up to').nextSibling).toHaveTextContent('1,009.00')
    expect(screen.getByText(/lands exactly on what the statement accounts for/)).toBeInTheDocument()
  })

  it('is short by the deposit total when none of them are in the ledger', () => {
    render(<Harness cashWallet={RECORDED_NO_DEPOSIT} />)

    expect(screen.getByText('2,000.00 short')).toBeInTheDocument()
    expect(screen.getByText(/Broker cash will be 2,000.00 EUR short/)).toBeInTheDocument()
  })

  it('closes the gap when the deposits are included from the panel', async () => {
    const user = userEvent.setup()
    render(<Harness cashWallet={RECORDED_NO_DEPOSIT} />)

    await user.click(screen.getByRole('button', { name: 'Include the deposits' }))

    expect(screen.getByRole('checkbox', { name: 'Deposits' })).toBeChecked()
    expect(screen.queryByText('2,000.00 short')).not.toBeInTheDocument()
    expect(screen.getByText(/lands exactly on what the statement accounts for/)).toBeInTheDocument()
  })

  it('moves the difference when the deposits are ticked directly', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('checkbox', { name: 'Deposits' }))

    // The deposits are now recorded twice: once as the user's own transfer and
    // once as an imported row.
    expect(screen.getByText('2,000.00 over')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Leave the deposits out' }))

    expect(screen.getByRole('checkbox', { name: 'Deposits' })).not.toBeChecked()
    expect(screen.getByText(/lands exactly on what the statement accounts for/)).toBeInTheDocument()
  })

  // The deposits are already in the wallet here, so a gap left after them comes
  // from somewhere else and ticking them would widen it by the whole total.
  it('does not point at the deposits when including them would not help', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('checkbox', { name: 'Unrecognised rows' }))
    await user.click(screen.getByRole('checkbox', { name: 'Dividends' }))

    expect(screen.getByText('12.00 short')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Include the deposits' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set opening balance to 12.00 EUR/ })).toBeInTheDocument()
  })

  it('says what is missing instead of showing a number with no wallet behind it', () => {
    render(<Harness cashWallet={null} />)

    expect(screen.getByText('No cash wallet is linked to this account')).toBeInTheDocument()
    expect(screen.queryByText('Balance after import')).not.toBeInTheDocument()
  })

  // The wallet holds PLN and the file is denominated in EUR, so the statement
  // accounts for no PLN at all. Treating that nothing as the broker's balance
  // would tell the user to wipe the wallet.
  it('refuses to reconcile a wallet the statement is not denominated in', () => {
    render(<Harness cashWallet={{ name: 'Zloty cash', currency: 'PLN', initialBalance: 0, balance: 1200 }} />)

    expect(screen.getByText('Nothing here to reconcile against Zloty cash')).toBeInTheDocument()
    expect(screen.getByText(/rows add up to \+1,009.00 EUR/)).toBeInTheDocument()
    expect(screen.queryByText('Balance after import')).not.toBeInTheDocument()
    expect(screen.queryByText(/opening balance by/)).not.toBeInTheDocument()
  })

  it('refuses to reconcile a file that moves no cash', () => {
    render(<Harness statement={makeStatement({ rows: [] })} />)

    expect(screen.getByText(/moves no cash at all/)).toBeInTheDocument()
    expect(screen.queryByText(/opening balance by/)).not.toBeInTheDocument()
  })
})

describe('ImportPreview on a second upload of an overlapping statement', () => {
  const alreadyStored: ExistingTrade[] = [
    { externalId: 'buy-1', amount: -1000, currency: 'EUR' },
    { externalId: 'fee-1', amount: -3, currency: 'EUR' },
  ]

  it('reads as new versus already imported rather than as a duplicate import', () => {
    render(<Harness existingTrades={alreadyStored} />)

    expect(screen.getByText('1 to import, 2 already imported')).toBeInTheDocument()
  })

  it('marks the groups the repeated rows came from', () => {
    render(<Harness existingTrades={alreadyStored} />)

    // The buy and the fee, each the only row of its group.
    expect(screen.getAllByText('1 row · 1 already imported')).toHaveLength(2)
  })

  it('does not count an already imported row twice in the reconciliation', () => {
    render(<Harness existingTrades={alreadyStored} />)

    expect(screen.getByText('Balance after import').nextSibling).toHaveTextContent('1,009.00')
  })
})

describe('how a row-level note is shown', () => {
  // The parser attaches a note to rows it read perfectly well - a Revolut total
  // sitting a couple of cents off quantity x price, because the broker took a
  // spread. Colouring that like a failure alongside a row nobody could classify
  // teaches the reader to skip both, and one of them matters.
  it('reserves the alarming colour for a row that could not be read', async () => {
    const statement = makeStatement({
      rows: [
        makeRow({
          kind: 'sell',
          amount: 41.17,
          externalId: 'sold',
          quantity: 0.0860102,
          price: 478.9,
          warnings: ['Total 41.17 differs from quantity x price 41.19'],
        }),
        makeRow({
          kind: 'unknown',
          amount: 1.23,
          externalId: 'baffling',
          warnings: ['No rule matched this description, so it was left unclassified'],
        }),
      ],
    })
    render(<Harness statement={statement} />)

    const advisory = await screen.findByText('Total 41.17 differs from quantity x price 41.19')
    const failure = await screen.findByText('No rule matched this description, so it was left unclassified')

    expect(advisory.closest('p')).not.toHaveClass('text-destructive')
    expect(failure.closest('p')).toHaveClass('text-destructive')
  })
})

describe('correcting the opening balance', () => {
  // The case that has no checkbox: the broker held money before the ledger
  // existed. Neither ticking nor unticking deposits can express it - one is
  // short by what came before, the other double-counts the transfers that were
  // recorded - so the wallet's starting point is what has to move.
  it('offers the exact figure that brings the wallet in line, and reports the delta', async () => {
    const user = userEvent.setup()
    const onAdjustOpeningBalance = vi.fn()
    render(
      <Harness
        cashWallet={{ name: 'Broker cash', currency: 'EUR', balance: 100, initialBalance: 40 }}
        onAdjustOpeningBalance={onAdjustOpeningBalance}
      />
    )

    const button = await screen.findByRole('button', { name: /Set opening balance to/ })
    await user.click(button)

    expect(onAdjustOpeningBalance).toHaveBeenCalledTimes(1)
    const [delta] = onAdjustOpeningBalance.mock.calls[0]
    // Whatever the gap is, applying it to today's opening balance is what the
    // button must offer - the label and the callback cannot disagree.
    expect(button.textContent).toContain(formatMoney(40 + delta))
  })

  it('measures against the balance the broker states, not the sum of the rows', async () => {
    // A date-filtered export sums to that period's change, and treating it as
    // the balance would set an opening balance wrong by everything before it.
    render(
      <Harness
        statement={makeStatement({ statedBalances: [{ currency: 'EUR', amount: 5000 }] })}
        cashWallet={{ name: 'Broker cash', currency: 'EUR', balance: 0, initialBalance: 0 }}
      />
    )

    expect(await screen.findByText('5,000.00')).toBeInTheDocument()
    expect(screen.getByText(/says the account holds/)).toBeInTheDocument()
  })
})
