import { useState } from 'react'
import { PiggyBank, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveSavingGoals } from '@/hooks/useLiveSavingGoals'
import { GoalDialog } from './GoalDialog'
import { WalletGoalsSection } from './WalletGoalsSection'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

type FilterTab = 'active' | 'achieved' | 'all'

export function SavingsContent() {
  const { wallets } = useLiveWallets()
  const { goals } = useLiveSavingGoals()
  const [filter, setFilter] = useState<FilterTab>('active')
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null)

  const savingsWallets = wallets.filter(w => w.isSavings)

  const filteredGoals = goals.filter(goal => {
    if (filter === 'active') return !goal.achieved
    if (filter === 'achieved') return goal.achieved
    return true
  })

  const goalsByWallet = savingsWallets.map(wallet => ({
    wallet,
    goals: filteredGoals.filter(g => g.walletId === wallet._id),
  }))

  const handleEdit = (goal: SavingGoal) => {
    setEditingGoal(goal)
    setGoalDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setGoalDialogOpen(false)
    setEditingGoal(null)
  }

  if (savingsWallets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <PiggyBank className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-medium">No savings wallets</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Mark a wallet as &ldquo;Savings&rdquo; in wallet settings to start tracking goals.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Savings Goals</h2>
        <Button size="sm" onClick={() => setGoalDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Goal
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="achieved">Achieved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {goalsByWallet.map(({ wallet, goals: walletGoals }) => (
        <WalletGoalsSection
          key={wallet._id}
          wallet={wallet}
          goals={walletGoals}
          onEdit={handleEdit}
        />
      ))}

      <GoalDialog
        open={goalDialogOpen}
        onOpenChange={handleCloseDialog}
        goal={editingGoal}
        savingsWallets={savingsWallets}
      />
    </div>
  )
}
