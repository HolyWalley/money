import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/format-money'

export interface CommittedAmounts {
  recurring: number
  savings: number
  total: number
}

interface BalanceSummaryCardProps {
  total: number
  spendable: number
  savings: number
  /**
   * Holdings at market value, or null when there is no brokerage at all, which
   * leaves the card exactly as it was before anyone invested anything.
   */
  investments: number | null
  baseCurrency: string
  /**
   * What the period still owes, or null when the period is not the one we are
   * living in - last March's commitments say nothing about today's balance.
   */
  commitments: CommittedAmounts | null
  missingCurrencies: string[]
  /** How many holdings the total is missing because nothing could value them. */
  unvaluedHoldings: number
  /**
   * Whether the figures are still being read.
   *
   * They arrive from IndexedDB rather than from the network, so this is a
   * frame or two - but a frame of "0.00 PLN" reads as being broke, and the
   * figure it settles on is the one worth waiting a frame for.
   */
  isLoading: boolean
}

function commitmentsCaption(commitments: CommittedAmounts): string {
  const parts: string[] = []

  if (commitments.recurring > 0) {
    parts.push(`${formatMoney(commitments.recurring)} recurring`)
  }
  if (commitments.savings > 0) {
    parts.push(`${formatMoney(commitments.savings)} to savings`)
  }

  if (parts.length === 0) {
    return 'Nothing left to pay this period'
  }

  return `Spendable, less ${parts.join(' and ')}`
}

/**
 * Everything the headline figure leaves out, each said the same way, because
 * two differently worded warnings read as two unrelated problems.
 */
function exclusions(missingCurrencies: string[], unvaluedHoldings: number): string[] {
  const notes: string[] = []

  if (missingCurrencies.length > 0) {
    notes.push(`Excludes ${missingCurrencies.join(', ')} — no exchange rate available.`)
  }
  if (unvaluedHoldings > 0) {
    notes.push(
      `Excludes ${unvaluedHoldings} holding${unvaluedHoldings === 1 ? '' : 's'} — no current value available.`
    )
  }

  return notes
}

export function BalanceSummaryCard({
  total,
  spendable,
  savings,
  investments,
  baseCurrency,
  commitments,
  missingCurrencies,
  unvaluedHoldings,
  isLoading,
}: BalanceSummaryCardProps) {
  // Savings is money already spoken for, and a holding is not money at all
  // until it is sold. Spending against either is how a month ends up eating its
  // own emergency fund, so only spendable funds this.
  const free = commitments ? spendable - commitments.total : 0

  const notes = exclusions(missingCurrencies, unvaluedHoldings)

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <div className="text-xs text-muted-foreground mb-1">Net worth</div>
        {isLoading ? (
          <Skeleton className="h-8 w-40" data-testid="net-worth-loading" />
        ) : (
          <div className="text-2xl font-bold">
            {formatMoney(total)}{' '}
            <span className="text-sm font-normal text-muted-foreground">{baseCurrency}</span>
          </div>
        )}
      </div>

      {/* Kept side by side rather than spread across the card: these are a
          breakdown of the figure above them, not independent statistics. */}
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <div className="text-xs text-muted-foreground">Spendable</div>
          {isLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <div className="font-semibold">{formatMoney(spendable)}</div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Savings</div>
          {isLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <div className="font-semibold">{formatMoney(savings)}</div>
          )}
        </div>
        {/* Nothing while it is unknown whether there is a brokerage at all: a
            column that appears a frame late shifts the two beside it. */}
        {isLoading ? (
          <div>
            <div className="text-xs text-muted-foreground">Investments</div>
            <Skeleton className="h-5 w-20" />
          </div>
        ) : (
          investments !== null && (
            <div>
              <div className="text-xs text-muted-foreground">Investments</div>
              <div className="font-semibold">{formatMoney(investments)}</div>
            </div>
          )
        )}
      </div>

      {commitments && (
        <div className="border-t pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Free to spend</span>
            <span
              className={`text-lg font-bold ${free < 0 ? 'text-red-600' : 'text-foreground'}`}
            >
              {formatMoney(free)}{' '}
              <span className="text-xs font-normal text-muted-foreground">{baseCurrency}</span>
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{commitmentsCaption(commitments)}</div>
        </div>
      )}

      {notes.map(note => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  )
}
