import { forwardRef, useMemo, useState } from 'react'
import { type Transaction } from '../../../shared/schemas/transaction.schema'
import { Button } from '@/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
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
import type { CurrencyMapEntry } from '@/lib/currencies'
import { useAuth } from '@/contexts/AuthContext'

interface TransactionDesktopRowProps {
  transaction: Transaction
  wallets: Wallet[]
  rates: CurrencyMapEntry[]
  categories: Category[]
  onEdit: () => void
  onDelete: (id: string) => void
  style?: React.CSSProperties
}

export const TransactionDesktopRow = forwardRef<HTMLDivElement, TransactionDesktopRowProps>(
  ({ transaction, wallets, categories, rates, onEdit, onDelete, style }, ref) => {
    const { user } = useAuth()
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

    const { amountInBaseCurrency, exchangeRate } = useMemo(() => {
      if (!user?.settings?.defaultCurrency) {
        return { amountInBaseCurrency: undefined, exchangeRate: undefined };
      }

      const txTs = new Date(transaction.date).getTime()

      const extractRate = (from: string, to: string) => {
        // NOTE: not the most effective way, but for now it works
        const filteredRates = rates.filter(rate => rate.from === from && rate.to === to)
        const sortedRates = filteredRates.sort((a, b) => Math.abs(a.ts - txTs) - Math.abs(b.ts - txTs))
        return sortedRates.at(0)?.rate
      }

      // For transfers, show the rate that was used for this specific transfer
      if (transaction.transactionType === 'transfer' && transaction.toAmount && transaction.toCurrency) {
        if (transaction.currency === user.settings.defaultCurrency) {
          // Source is already in base currency, show destination conversion
          const rate = transaction.amount / transaction.toAmount
          return {
            amountInBaseCurrency: transaction.amount.toFixed(2),
            exchangeRate: `${rate.toFixed(3)}`
          }
        } else if (transaction.toCurrency === user.settings.defaultCurrency) {
          // Destination is in base currency
          const rate = transaction.toAmount / transaction.amount
          console.log(transaction.toCurrency, rate)
          return {
            amountInBaseCurrency: transaction.toAmount.toFixed(2),
            exchangeRate: `${rate.toFixed(3)}`
          }
        }
      }

      const idealRate = extractRate(transaction.currency, user.settings.defaultCurrency)
      const revertedRate = extractRate(user.settings.defaultCurrency, transaction.currency)

      const rate = idealRate || (revertedRate ? 1 / revertedRate : undefined)

      if (!rate) {
        return { amountInBaseCurrency: `-`, exchangeRate: undefined }
      } else {
        return {
          amountInBaseCurrency: (rate * transaction.amount).toFixed(2),
          exchangeRate: rate.toFixed(3)
        }
      }
    }, [rates, user?.settings?.defaultCurrency, transaction.date, transaction.transactionType, transaction.amount, transaction.currency, transaction.toAmount, transaction.toCurrency])

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
            <div className="flex flex-col items-end">
              <p>{formatAmount(transaction.amount, transaction.transactionType)} {transaction.currency}</p>
              {transaction.transactionType === 'transfer' && transaction.toAmount && transaction.toCurrency && transaction.currency !== transaction.toCurrency && (
                <p className="text-xs text-muted-foreground">
                  → {transaction.toAmount.toFixed(2)} {transaction.toCurrency}
                </p>
              )}
            </div>
          </div>

          <div className={`col-span-2 text-right font-medium`}>
            {amountInBaseCurrency && (
              <div className="flex flex-col items-end">
                <p>{amountInBaseCurrency}</p>
                {exchangeRate && (
                  <p className="text-xs text-muted-foreground">@ {exchangeRate}</p>
                )}
              </div>
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
