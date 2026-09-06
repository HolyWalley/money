import { ChartCandlestick, MoreHorizontal, Pencil, PiggyBank, Trash } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface WalletCardProps {
  wallet: Wallet
  /**
   * The broker whose cash this wallet holds, where it holds one.
   *
   * Worth saying on the card, because such a wallet moves without a
   * transaction behind it to point at: a statement is stored as trades, and
   * the balance is derived from them along with the ledger's own rows.
   */
  brokerName?: string
  balance: number
  onEdit: (wallet: Wallet) => void
  onDelete: (wallet: Wallet) => void
}

export function WalletCard({ wallet, brokerName, balance, onEdit, onDelete }: WalletCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: wallet._id,
    animateLayoutChanges: () => false,
  })

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-1.5">
            {wallet.isSavings && <PiggyBank className="h-4 w-4 text-muted-foreground" />}
            {brokerName && (
              <ChartCandlestick
                className="text-muted-foreground h-4 w-4"
                aria-label={`Holds ${brokerName}'s cash`}
              />
            )}
            {wallet.name}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onPointerDown={(e) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(wallet)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(wallet)}
                className="text-destructive focus:text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(balance, wallet.currency)}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {brokerName ? `Cash at ${brokerName}, after imported trades` : 'Current balance'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
