import { useState } from 'react'
import { ArrowDownToLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUnallocatedAmount } from '@/hooks/useUnallocatedAmount'
import { GoalAdjustDrawer } from './GoalAdjustDrawer'
import { GoalCard } from './GoalCard'
import type { Wallet } from '../../../shared/schemas/wallet.schema'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

interface WalletGoalsSectionProps {
  wallet: Wallet
  goals: SavingGoal[]
  onEdit: (goal: SavingGoal) => void
}

export function WalletGoalsSection({ wallet, goals, onEdit }: WalletGoalsSectionProps) {
  const { unallocated, isLoading } = useUnallocatedAmount(wallet._id)
  const [allocationOpen, setAllocationOpen] = useState(false)

  const hasEligibleGoals = goals.some(g => !g.achieved && g.allocatedAmount < g.targetAmount)
  const canAllocate = !isLoading && unallocated > 0 && hasEligibleGoals

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: wallet.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{wallet.name}</h3>
        <div className="flex items-center gap-2">
          {canAllocate && (
            <Button size="sm" variant="outline" onClick={() => setAllocationOpen(true)}>
              <ArrowDownToLine className="h-3.5 w-3.5 mr-1" />
              Allocate
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Unallocated: {isLoading ? '...' : formatCurrency(unallocated)}
          </span>
        </div>
      </div>

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No goals matching filter for this wallet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map(goal => (
            <GoalCard
              key={goal._id}
              goal={goal}
              currency={wallet.currency}
              onEdit={() => onEdit(goal)}
            />
          ))}
        </div>
      )}

      <GoalAdjustDrawer
        open={allocationOpen}
        onOpenChange={setAllocationOpen}
        walletId={wallet._id}
        currency={wallet.currency}
      />
    </div>
  )
}
