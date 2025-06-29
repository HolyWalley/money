import { forwardRef, useMemo } from 'react'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { type Transaction } from '../../../shared/schemas/transaction.schema'
import { ReceiptText } from 'lucide-react'
import { CategoryIcon } from '../categories/CategoryIcon'

interface TransactionMobileCardProps {
  transaction: Transaction
  onEdit: () => void
  style?: React.CSSProperties
}

export const TransactionMobileCard = forwardRef<HTMLDivElement, TransactionMobileCardProps>(
  ({ transaction, onEdit, style }, ref) => {
    const { wallets } = useLiveWallets()
    const { categories } = useLiveCategories()

    const category = useMemo(() => {
      return categories.find(c => c._id === transaction.categoryId)
    }, [categories, transaction.categoryId])

    const getWalletName = (walletId: string) => {
      const wallet = wallets.find(w => w._id === walletId)
      if (!wallet) return 'Unknown Wallet'

      return `${wallet.name} (${wallet.currency})`
    }

    const formatAmount = (amount: number, type: 'income' | 'expense' | 'transfer') => {
      const formatted = amount.toFixed(2)
      if (type === 'income') {
        return `+${formatted}`
      } else if (type === 'expense') {
        return `-${formatted}`
      }
      return formatted
    }

    const getAmountColor = (type: 'income' | 'expense' | 'transfer') => {
      if (type === 'income') return 'text-green-600'
      if (type === 'expense') return 'text-red-600'
      return 'text-foreground'
    }

    const getCategoryIcon = () => {
      if (!category) {
        return <ReceiptText className="size-6 text-muted-foreground" />
      }

      return <CategoryIcon icon={category.icon} color={category.color} />
    }

    return (
      <div ref={ref} style={style} className="px-4" onClick={onEdit}>
        <div className="flex items-center gap-3 py-3 border-b border-border/50">
          {/* Left: Icon + Category */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-10 h-10 flex items-center justify-center">
              {getCategoryIcon()}
            </div>
          </div>

          {/* Middle: Transaction details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>

            <div className="text-sm text-muted-foreground truncate">
              <span className="truncate">
                {getWalletName(transaction.walletId)}
                {transaction.toWalletId && (
                  <span> → {getWalletName(transaction.toWalletId)}</span>
                )}
              </span>
            </div>
          </div>

          {/* Right: Amount + Edit */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`font-semibold ${getAmountColor(transaction.transactionType)}`}>
              {formatAmount(transaction.amount, transaction.transactionType)} {transaction.currency}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

TransactionMobileCard.displayName = 'TransactionMobileCard'
