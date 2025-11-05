import { forwardRef, useMemo } from 'react'
import { type Transaction } from '../../../shared/schemas/transaction.schema'
import { ReceiptText } from 'lucide-react'
import { CategoryIcon } from '../categories/CategoryIcon'
import type { Category } from 'shared/schemas/category.schema'
import type { Wallet } from 'shared/schemas/wallet.schema'

interface TransactionMobileCardProps {
  transaction: Transaction
  wallets: Wallet[]
  categories: Category[]
  onEdit: () => void
  onWalletClick?: (walletId: string, walletName: string) => void
  onCategoryClick?: (categoryId: string, categoryName: string) => void
  style?: React.CSSProperties
}

export const TransactionMobileCard = forwardRef<HTMLDivElement, TransactionMobileCardProps>(
  ({ transaction, wallets, categories, onEdit, onWalletClick, onCategoryClick, style }, ref) => {

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
      <div ref={ref} style={style} className="px-4">
        <div className="flex items-center gap-3 py-3 border-b border-border/50">
          {/* Left: Icon + Category */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (category) {
                onCategoryClick?.(category._id, category.name)
              }
            }}
            className="flex items-center gap-2 flex-shrink-0 cursor-pointer"
          >
            <div className="w-10 h-10 flex items-center justify-center">
              {getCategoryIcon()}
            </div>
          </button>

          {/* Middle: Transaction details */}
          <div className="flex-1 min-w-0" onClick={onEdit}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>

            <div className="text-sm text-muted-foreground truncate">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const wallet = wallets.find(w => w._id === transaction.walletId)
                  if (wallet) {
                    onWalletClick?.(wallet._id, wallet.name)
                  }
                }}
                className="cursor-pointer"
              >
                {getWalletName(transaction.walletId)}
              </button>
              {transaction.toWalletId && (
                <>
                  <span> → </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const wallet = wallets.find(w => w._id === transaction.toWalletId)
                      if (wallet) {
                        onWalletClick?.(wallet._id, wallet.name)
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {getWalletName(transaction.toWalletId)}
                  </button>
                </>
              )}
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
