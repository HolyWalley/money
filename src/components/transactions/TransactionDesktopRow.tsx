import { forwardRef } from 'react'
import { type Transaction } from '../../../shared/schemas/transaction.schema'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Wallet } from 'shared/schemas/wallet.schema'
import type { Category } from 'shared/schemas/category.schema'

interface TransactionDesktopRowProps {
  transaction: Transaction
  wallets: Wallet[]
  categories: Category[]
  onEdit: () => void
  style?: React.CSSProperties
}

export const TransactionDesktopRow = forwardRef<HTMLDivElement, TransactionDesktopRowProps>(
  ({ transaction, wallets, categories, onEdit, style }, ref) => {

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
      <div
        ref={ref}
        className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-muted/50 border-b"
        style={style}
      >
        <div className="col-span-2 flex items-center gap-2">
          {category ? (
            <>
              <CategoryIcon
                icon={category.icon}
                color={category.color}
                size="sm"
              />
              <span className="text-sm truncate">{category.name}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </div>

        <div className="col-span-2 text-muted-foreground text-sm">
          {new Date(transaction.date).toLocaleDateString()}
        </div>

        <div className="col-span-2 text-sm truncate">
          {getWalletName(transaction.walletId)}
          {transaction.toWalletId && (
            <span className="text-muted-foreground">
              {' → '}{getWalletName(transaction.toWalletId)}
            </span>
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
          {formatAmount(transaction.amount, transaction.transactionType)} {transaction.currency}
        </div>

        <div className="col-span-1 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="h-8 w-8 p-0"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }
)

TransactionDesktopRow.displayName = 'TransactionDesktopRow'
