import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import { parseRRule } from '@/lib/recurring-utils'
import type { RecurringPayment } from '../../../shared/schemas/recurring-payment.schema'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface RecurringPaymentItemProps {
  payment: RecurringPayment
  category?: Category
  wallet?: Wallet
  onEdit: (payment: RecurringPayment) => void
  onDelete: (payment: RecurringPayment) => void
}

export function RecurringPaymentItem({
  payment,
  category,
  wallet,
  onEdit,
  onDelete,
}: RecurringPaymentItemProps) {
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

  const frequencySummary = parseRRule(payment.rrule)

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-b-0">
      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
        {category ? (
          <CategoryIcon icon={category.icon} color={category.color} />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {payment.description || category?.name || 'Payment'}
        </div>
        <div className="text-sm text-muted-foreground">
          {frequencySummary}
          {wallet && ` · ${wallet.name}`}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <span className={`font-semibold ${getAmountColor(payment.transactionType)}`}>
          {formatAmount(payment.amount, payment.transactionType)} {payment.currency}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(payment)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(payment)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
