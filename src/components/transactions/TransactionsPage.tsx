import { useLiveTransactions } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'

export function TransactionsPage() {
  const { transactions, isLoading } = useLiveTransactions()
  const isMobile = useIsMobile()

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center min-h-[200px]">
        <div className="text-muted-foreground">Loading transactions...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 h-full flex flex-col">
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </p>
      </div>
      
      <div className="flex-1 min-h-0">
        <VirtualizedTransactionList 
          transactions={transactions}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
