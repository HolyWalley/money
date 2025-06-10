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

export function TransactionTable() {
  const { transactions, isLoading } = useLiveTransactions()
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading transactions...</p>
        </CardContent>
      </Card>
    )
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
