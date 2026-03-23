import { useWalletBalance } from './useWalletBalance'
import { useLiveSavingGoals } from './useLiveSavingGoals'

export function useUnallocatedAmount(walletId: string) {
  const { balance, isLoading: balanceLoading } = useWalletBalance(walletId)
  const { goals, isLoading: goalsLoading } = useLiveSavingGoals(walletId)

  const activeGoals = goals.filter(g => !g.achieved)
  const totalAllocated = activeGoals.reduce((sum, g) => sum + g.allocatedAmount, 0)
  const unallocated = Math.round((balance - totalAllocated) * 100) / 100

  return {
    unallocated,
    totalAllocated,
    balance,
    isLoading: balanceLoading || goalsLoading,
  }
}
