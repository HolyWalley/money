import { forwardRef } from 'react'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { type Transaction } from '../../../shared/schemas/transaction.schema'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'

interface TransactionDesktopRowProps {
  transaction: Transaction
  onEdit: () => void
  style?: React.CSSProperties
}

export const TransactionDesktopRow = forwardRef<HTMLDivElement, TransactionDesktopRowProps>(
  ({ transaction, onEdit, style }, ref) => {
  const { wallets } = useLiveWallets()
  const { categories } = useLiveCategories()

  const getWalletName = (walletId: string) => {
    const wallet = wallets.find(w => w._id === walletId)
    return wallet?.name || 'Unknown Wallet'
  }

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return '-'
    const category = categories.find(c => c._id === categoryId)
    return category?.name || 'Unknown Category'
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

  return (
    <div 
      ref={ref}
      className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-muted/50 border-b"
      style={style}
    >
      <div className="col-span-2 font-medium truncate">
        {transaction.note}
      </div>
      
      <div className="col-span-1 capitalize text-sm">
        {transaction.transactionType}
      </div>
      
      <div className="col-span-2 text-sm truncate">
        {getCategoryName(transaction.categoryId)}
      </div>
      
      <div className="col-span-2 text-sm truncate">
        {getWalletName(transaction.walletId)}
        {transaction.toWalletId && (
          <span className="text-muted-foreground">
            {' → '}{getWalletName(transaction.toWalletId)}
          </span>
        )}
      </div>
      
      <div className={`col-span-2 text-right font-medium ${getAmountColor(transaction.transactionType)}`}>
        {formatAmount(transaction.amount, transaction.transactionType)} {transaction.currency}
      </div>
      
      <div className="col-span-2 text-muted-foreground text-sm">
        {new Date(transaction.date).toLocaleDateString()}
      </div>
      
      <div className="col-span-1">
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
