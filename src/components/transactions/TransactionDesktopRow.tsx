import { forwardRef, useMemo } from 'react'
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
import type { CurrencyMapEntry } from '@/lib/currencies'
import { useAuth } from '@/contexts/AuthContext'
import bsearch from 'binary-search'

interface TransactionDesktopRowProps {
  transaction: Transaction
  wallets: Wallet[]
  rates: CurrencyMapEntry[]
  categories: Category[]
  onEdit: () => void
  style?: React.CSSProperties
}

export const TransactionDesktopRow = forwardRef<HTMLDivElement, TransactionDesktopRowProps>(
  ({ transaction, wallets, categories, rates, onEdit, style }, ref) => {
    const { user } = useAuth()

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

    const amountInBaseCurrency = useMemo(() => {
      if (transaction.transactionType === 'transfer') {
        return;
      }

      if (!user?.settings?.defaultCurrency) {
        return;
      }

      if (user?.settings?.defaultCurrency === transaction.currency) {
        return;
      }

      const txTs = new Date(transaction.date).getTime()

      const extractRate = (from: string, to: string) => {
        const filteredRates = rates.filter(rate => rate.from === from && rate.to === to)
        const idx = bsearch(filteredRates, { ts: txTs }, (a, b) => a.ts - b.ts)

        let realIdx;
        if (idx >= 0) {
          realIdx = idx
        } else {
          const ins = ~idx
          realIdx = ins - 1
        }

        return filteredRates[realIdx]?.rate
      }
      const idealRate = extractRate(transaction.currency, user.settings.defaultCurrency)
      const revertedRate = extractRate(user.settings.defaultCurrency, transaction.currency)

      console.log('Rates for transaction:', { idealRate, revertedRate })

      const rate = idealRate || (revertedRate ? 1 / revertedRate : undefined)

      if (!rate) {
        return `-`
      } else {
        return (rate * transaction.amount).toFixed(2)
      }
    }, [rates, user?.settings?.defaultCurrency, transaction.date, transaction.transactionType, transaction.amount, transaction.currency])

    const category = getCategory(transaction.categoryId)

    return (
      <div
        ref={ref}
        className="grid grid-cols-14 gap-4 px-4 py-3 items-center hover:bg-muted/50 border-b"
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

        <div className={`col-span-2 text-right font-medium`}>
          <p>{amountInBaseCurrency}</p>
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
