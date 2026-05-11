import { Button } from '@/components/ui/button'
import { PiggyBank, Send } from 'lucide-react'
import type { WalletSavingsSuggestion } from '@/lib/savings-suggestion'

interface SavingsSuggestionCardProps {
  suggestion: WalletSavingsSuggestion
  onLogTransfer: (suggestion: WalletSavingsSuggestion) => void
}

export function SavingsSuggestionCard({ suggestion, onLogTransfer }: SavingsSuggestionCardProps) {
  const { wallet, currency, amount, contributingGoalCount } = suggestion
  const subtitle =
    contributingGoalCount === 1
      ? '1 goal · suggested transfer'
      : `${contributingGoalCount} goals · suggested transfer`

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4 border-b border-border/50 last:border-b-0">
      <div className="flex items-center justify-center flex-shrink-0">
        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
          <PiggyBank className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate text-sm sm:text-base">
            {wallet.name}
          </span>
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground truncate">
          {subtitle}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <span className="font-semibold text-sm sm:text-base text-foreground">
          {amount.toFixed(2)} {currency}
        </span>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
          onClick={() => onLogTransfer(suggestion)}
          title="Log transfer"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
