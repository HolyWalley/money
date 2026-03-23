import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { TransactionDrawer } from './TransactionDrawer'
import { transactionService } from '@/services/transactionService'
import { useAuth } from '@/contexts/AuthContext'
import { Plus } from 'lucide-react'
import { type CreateTransaction } from '../../../shared/schemas/transaction.schema'

export function NewTransactionTrigger() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()

  const handleSubmit = useCallback(async (data: CreateTransaction) => {
    if (!user) return
    await transactionService.createTransaction(data)
  }, [user])

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="size-8"
        variant="secondary"
        size="icon"
      >
        <Plus />
      </Button>

      <TransactionDrawer
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
      />
    </>
  )
}
