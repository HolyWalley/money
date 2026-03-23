import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useEventBus } from '@/hooks/useEventBus'
import { savingGoalService } from '@/services/savingGoalService'
import { db } from '@/lib/db-dexie'
import { GoalAdjustDrawer } from './GoalAdjustDrawer'
import type { Transaction } from '../../../shared/schemas/transaction.schema'

interface DrawerState {
  walletId: string
  currency: string
}

export function SavingsNotificationListener() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null)

  const openDrawer = useCallback((walletId: string, currency: string) => {
    setDrawerState({ walletId, currency })
    setDrawerOpen(true)
  }, [])

  const formatCurrency = useCallback((value: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }, [])

  const checkAllocation = useCallback(async (walletId: string) => {
    const wallet = await db.wallets.get(walletId)
    if (!wallet?.isSavings) return

    const activeGoals = await savingGoalService.getActiveGoalsByWallet(walletId)
    if (activeGoals.some(g => g.allocatedAmount < g.targetAmount)) {
      toast('Savings balance increased', {
        duration: 10000,
        action: {
          label: 'Allocate',
          onClick: () => openDrawer(walletId, wallet.currency),
        },
      })
    }
  }, [openDrawer])

  const checkDeallocation = useCallback(async (walletId: string) => {
    const wallet = await db.wallets.get(walletId)
    if (!wallet?.isSavings) return

    const unallocated = await savingGoalService.getUnallocatedAmount(walletId)
    if (unallocated < 0) {
      toast(`Goals exceed balance by ${formatCurrency(Math.abs(unallocated), wallet.currency)}`, {
        duration: 10000,
        action: {
          label: 'Adjust Goals',
          onClick: () => openDrawer(walletId, wallet.currency),
        },
      })
    }
  }, [openDrawer, formatCurrency])

  const handleTransaction = useCallback(async (tx: Transaction) => {
    // Money IN to savings: income to walletId, or transfer to toWalletId
    if (tx.transactionType === 'income') {
      await checkAllocation(tx.walletId)
    } else if (tx.transactionType === 'transfer' && tx.toWalletId) {
      await checkAllocation(tx.toWalletId)
    }

    // Money OUT from savings: expense or transfer from walletId
    if (tx.transactionType === 'expense' || tx.transactionType === 'transfer') {
      await checkDeallocation(tx.walletId)
    }
  }, [checkAllocation, checkDeallocation])

  useEventBus('transaction:created', handleTransaction)

  if (!drawerState) return null

  return (
    <GoalAdjustDrawer
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      walletId={drawerState.walletId}
      currency={drawerState.currency}
    />
  )
}
