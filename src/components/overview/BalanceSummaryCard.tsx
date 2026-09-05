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
  baseCurrency: string
  /**
   * What the period still owes, or null when the period is not the one we are
   * living in - last March's commitments say nothing about today's balance.
   */
  commitments: CommittedAmounts | null
  missingCurrencies: string[]
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

export function BalanceSummaryCard({
  total,
  spendable,
  savings,
  baseCurrency,
  commitments,
  missingCurrencies,
}: BalanceSummaryCardProps) {
  // Savings is money already spoken for. Spending against it is how a month
  // ends up eating its own emergency fund, so only spendable funds this.
  const free = commitments ? spendable - commitments.total : 0

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <div className="text-xs text-muted-foreground mb-1">Net worth</div>
        <div className="text-2xl font-bold">
          {formatMoney(total)}{' '}
          <span className="text-sm font-normal text-muted-foreground">{baseCurrency}</span>
        </div>
      </div>

      {/* Kept side by side rather than spread across the card: these two are a
          breakdown of the figure above them, not two independent statistics. */}
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <div className="text-xs text-muted-foreground">Spendable</div>
          <div className="font-semibold">{formatMoney(spendable)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Savings</div>
          <div className="font-semibold">{formatMoney(savings)}</div>
        </div>
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

      {missingCurrencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Excludes {missingCurrencies.join(', ')} — no exchange rate available.
        </p>
      )}
    </div>
  )
}
