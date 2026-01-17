import { forwardRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Edit, Trash2, Repeat } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import type { Wallet } from 'shared/schemas/wallet.schema'
import type { Category } from 'shared/schemas/category.schema'
import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'

interface TransactionDesktopRowProps {
  transaction: DecoratedTransaction
  wallets: Wallet[]
  categories: Category[]
  onEdit: () => void
  onDelete: (id: string) => void
  onWalletClick?: (walletId: string, walletName: string) => void
  onCategoryClick?: (categoryId: string, categoryName: string) => void
  onMakeRecurring?: () => void
  style?: React.CSSProperties
}

export const TransactionDesktopRow = forwardRef<HTMLDivElement, TransactionDesktopRowProps>(
  ({ transaction, wallets, categories, onEdit, onDelete, onWalletClick, onCategoryClick, onMakeRecurring, style }, ref) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const getWalletName = (walletId: string) => {
      const wallet = wallets.find(w => w._id === walletId)
      return wallet?.name || 'Unknown Wallet'
    }

    const getCategory = (categoryId?: string) => {
      if (!categoryId) return null
      return categories.find(c => c._id === categoryId) || null
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

    const category = getCategory(transaction.categoryId)

    return (
      <>
        <div
          ref={ref}
          className="grid grid-cols-14 gap-4 px-4 py-3 items-center hover:bg-muted/50 border-b"
          style={style}
        >
          <div className="col-span-2 flex items-center gap-2">
            {category ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCategoryClick?.(category._id, category.name)
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <CategoryIcon
                  icon={category.icon}
                  color={category.color}
                  size="sm"
                />
                <span className="text-sm truncate">{category.name}</span>
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">-</span>
            )}
          </div>

          <div className="col-span-2 text-muted-foreground text-sm">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="truncate cursor-help">
                    {new Date(transaction.date).toLocaleDateString()}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  <p>{new Date(transaction.date).getTime()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="col-span-2 text-sm truncate">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onWalletClick?.(transaction.walletId, getWalletName(transaction.walletId))
              }}
              className="cursor-pointer"
            >
              {getWalletName(transaction.walletId)}
            </button>
            {transaction.toWalletId && (
              <>
                <span className="text-muted-foreground">{' → '}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onWalletClick?.(transaction.toWalletId!, getWalletName(transaction.toWalletId!))
                  }}
                  className="text-muted-foreground cursor-pointer"
                >
                  {getWalletName(transaction.toWalletId)}
                </button>
              </>
            )}
          </div>

          <div className="col-span-3 font-medium">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="truncate cursor-help">
                    {transaction.note}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  <p>{transaction.note}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className={`col-span-2 text-right font-medium ${getAmountColor(transaction.transactionType)}`}>
            <div className="flex flex-col items-end">
              <p>{formatAmount(transaction.amount, transaction.transactionType)} {transaction.currency}</p>
              {transaction.transactionType === 'transfer' && transaction.toAmount && transaction.toCurrency && transaction.currency !== transaction.toCurrency && (
                <p className="text-xs text-muted-foreground">
                  → {transaction.toAmount.toFixed(2)} {transaction.toCurrency}
                </p>
              )}
            </div>
          </div>

          <div className={`col-span-2 text-right font-medium ${getAmountColor(transaction.transactionType)}`}>
            {transaction.amountInBaseCurrency !== null ? (
              <p>{formatAmount(transaction.amountInBaseCurrency, transaction.transactionType)}</p>
            ) : (
              <p className="text-muted-foreground">-</p>
            )}
          </div>

          <div className="col-span-1 flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
            {onMakeRecurring && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onMakeRecurring}
                className="h-8 w-8 p-0"
                title="Make recurring"
              >
                <Repeat className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              className="h-8 w-8 p-0 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ConfirmationDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Delete Transaction"
          description="Are you sure you want to delete this transaction? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
          onConfirm={() => onDelete(transaction._id)}
        />
      </>
    )
  }
)

TransactionDesktopRow.displayName = 'TransactionDesktopRow'
