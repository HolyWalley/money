import { useMemo } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import { Check, X, AlertCircle } from 'lucide-react'
import type { UpcomingPayment } from '@/hooks/useUpcomingPayments'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface UpcomingPaymentCardProps {
  payment: UpcomingPayment
  categories: Category[]
  wallets: Wallet[]
  onLog: (payment: UpcomingPayment) => void
  onSkip: (payment: UpcomingPayment) => void
}

export function UpcomingPaymentCard({
  payment,
  categories,
  wallets,
  onLog,
  onSkip,
}: UpcomingPaymentCardProps) {
  const { recurring, scheduledDate, status } = payment

  const category = useMemo(() => {
    return categories.find(c => c._id === recurring.categoryId)
  }, [categories, recurring.categoryId])

  const wallet = useMemo(() => {
    return wallets.find(w => w._id === recurring.walletId)
  }, [wallets, recurring.walletId])

  const formatAmount = (amount: number, type: 'income' | 'expense' | 'transfer') => {
    const formatted = amount.toFixed(2)
    if (type === 'income') return `+${formatted}`
    if (type === 'expense') return `-${formatted}`
    return formatted
  }

  const getAmountColor = (type: 'income' | 'expense' | 'transfer') => {
    if (type === 'income') return 'text-green-600'
    if (type === 'expense') return 'text-red-600'
    return 'text-foreground'
  }

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-border/50 last:border-b-0">
      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
        {category ? (
          <CategoryIcon icon={category.icon} color={category.color} />
        ) : (
          <div className="w-6 h-6 rounded-full bg-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {recurring.description || category?.name || 'Payment'}
          </span>
          {status === 'due' && (
            <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">
              <AlertCircle className="h-3 w-3" />
              Due
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {format(scheduledDate, 'MMM d')} · {wallet?.name || 'Unknown wallet'}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`font-semibold ${getAmountColor(recurring.transactionType)}`}>
          {formatAmount(recurring.amount, recurring.transactionType)} {recurring.currency}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
          onClick={() => onLog(payment)}
          title="Log payment"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => onSkip(payment)}
          title="Skip"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
