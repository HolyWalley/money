import { useMemo, useState } from 'react'
import { List as VirtualizedList, AutoSizer, type ListRowProps } from 'react-virtualized'
import { type Transaction } from '../../../shared/schemas/transaction.schema'
import { TransactionDesktopRow } from './TransactionDesktopRow'
import { TransactionMobileCard } from './TransactionMobileCard'
import { TransactionDrawer } from './TransactionDrawer'
import { transactionService } from '@/services/transactionService'
import { useAuth } from '@/contexts/AuthContext'
import { type CreateTransaction } from '../../../shared/schemas/transaction.schema'
import type { Wallet } from 'shared/schemas/wallet.schema'
import type { Category } from 'shared/schemas/category.schema'

interface VirtualizedTransactionListProps {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
  isMobile: boolean
  baseCurrency?: string
  exchangeRates: Map<string, number>
}

export function VirtualizedTransactionList({ transactions, wallets, categories, isMobile, baseCurrency, exchangeRates }: VirtualizedTransactionListProps) {
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { user } = useAuth()

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setIsDrawerOpen(true)
  }

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false)
    setEditingTransaction(null)
  }

  const handleEditSubmit = async (data: CreateTransaction) => {
    if (!user || !editingTransaction) return
    await transactionService.updateTransaction(editingTransaction._id, data)
    // Don't close here - let the drawer handle it through onOpenChange
  }

  const handleDelete = async (id: string) => {
    try {
      await transactionService.deleteTransaction(id)
    } catch (error) {
      console.error('Failed to delete transaction:', error)
    }
  }

  const rowHeight = useMemo(() => {
    return isMobile ? 65 : 60
  }, [isMobile])

  const rowRenderer = ({ index, key, style }: ListRowProps) => {
    const transaction = transactions[index]

    return isMobile ? (
      <TransactionMobileCard
        key={key}
        transaction={transaction}
        wallets={wallets}
        categories={categories}
        onEdit={() => handleEdit(transaction)}
        style={style}
      />
    ) : (
      <TransactionDesktopRow
        key={key}
        transaction={transaction}
        wallets={wallets}
        categories={categories}
        onEdit={() => handleEdit(transaction)}
        onDelete={handleDelete}
        style={style}
        baseCurrency={baseCurrency}
        exchangeRates={exchangeRates}
      />
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-muted-foreground">
        No transactions found
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-md flex flex-col h-full">
        {!isMobile && (
          <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_2.5fr_1.5fr_1.5fr_0.5fr] gap-4 px-4 py-3 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
            <div>Category</div>
            <div>Date</div>
            <div>Wallet</div>
            <div>Note</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Amount ({baseCurrency})</div>
            <div className="text-right">Actions</div>
          </div>
        )}
        <div className="flex-1">
          <AutoSizer>
            {({ height, width }: { height: number; width: number }) => (
              <VirtualizedList
                height={height}
                width={width}
                rowCount={transactions.length}
                rowHeight={rowHeight}
                rowRenderer={rowRenderer}
                overscanRowCount={5}
              />
            )}
          </AutoSizer>
        </div>
      </div>

      <TransactionDrawer
        transaction={editingTransaction}
        open={isDrawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDrawer()
          }
        }}
        onSubmit={handleEditSubmit}
        onDelete={handleDelete}
      />
    </>
  )
}
