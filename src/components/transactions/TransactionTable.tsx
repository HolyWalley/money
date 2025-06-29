import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveTransactions } from '@/hooks/useLiveTransactions'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { TransactionDrawer } from './TransactionDrawer'
import { transactionService } from '@/services/transactionService'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'
import { type CreateTransaction, type Transaction } from '../../../shared/schemas/transaction.schema'

export function TransactionTable() {
  const { transactions } = useLiveTransactions()
  const { wallets } = useLiveWallets()
  const { categories } = useLiveCategories()
  const { user } = useAuth()

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setEditDrawerOpen(true)
  }

  const handleEditSubmit = async (data: CreateTransaction) => {
    if (!user || !editingTransaction) return
    console.log('Updating transaction:', editingTransaction._id, data)
    await transactionService.updateTransaction(editingTransaction._id, data)
  }

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

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No transactions yet. Add your first transaction to get started!</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Note</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.slice(0, 10).map((transaction) => (
              <TableRow key={transaction._id}>
                <TableCell className="font-medium">
                  {transaction.note}
                </TableCell>
                <TableCell className="capitalize">
                  {transaction.transactionType}
                </TableCell>
                <TableCell>
                  {getCategoryName(transaction.categoryId)}
                </TableCell>
                <TableCell>
                  {getWalletName(transaction.walletId)}
                  {transaction.toWalletId && (
                    <span className="text-muted-foreground">
                      {' → '}{getWalletName(transaction.toWalletId)}
                    </span>
                  )}
                </TableCell>
                <TableCell className={`text-right font-medium ${getAmountColor(transaction.transactionType)}`}>
                  {formatAmount(transaction.amount, transaction.transactionType)} {transaction.currency}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(transaction.date).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEditTransaction(transaction)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <TransactionDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        transaction={editingTransaction}
        onSubmit={handleEditSubmit}
      />
    </Card>
  )
}
