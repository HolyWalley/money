import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Slider } from '@/components/ui/slider'
import { useUnallocatedAmount } from '@/hooks/useUnallocatedAmount'
import { savingGoalService } from '@/services/savingGoalService'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

interface GoalAdjustDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string
  currency: string
}

type Mode = 'allocate' | 'deallocate'

export function GoalAdjustDrawer({ open, onOpenChange, walletId, currency }: GoalAdjustDrawerProps) {
  const { unallocated, isLoading } = useUnallocatedAmount(walletId)
  const [goals, setGoals] = useState<SavingGoal[]>([])
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mode, setMode] = useState<Mode>('allocate')
  const [adjustAmount, setAdjustAmount] = useState(0)

  useEffect(() => {
    if (!open || isLoading) return

    const currentMode: Mode = unallocated >= 0 ? 'allocate' : 'deallocate'
    setMode(currentMode)
    setAdjustAmount(Math.abs(unallocated))

    savingGoalService.getActiveGoalsByWallet(walletId).then(activeGoals => {
      const filtered = currentMode === 'allocate'
        ? activeGoals.filter(g => g.allocatedAmount < g.targetAmount)
        : activeGoals.filter(g => g.allocatedAmount > 0)
      setGoals(filtered)
      setAmounts(Object.fromEntries(filtered.map(g => [g._id, 0])))
    })
  }, [open, isLoading, walletId, unallocated])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const totalAdjusted = Object.values(amounts).reduce((sum, v) => sum + v, 0)
  const remaining = Math.round((adjustAmount - totalAdjusted) * 100) / 100

  const handleSliderChange = (goalId: string, value: number[]) => {
    setAmounts(prev => ({ ...prev, [goalId]: Math.round(value[0] * 100) / 100 }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const entries = Object.entries(amounts)
        .filter(([, amount]) => amount > 0)
        .map(([goalId, amount]) => ({ goalId, amount }))

      if (entries.length > 0) {
        if (mode === 'allocate') {
          await savingGoalService.allocateToGoals(entries)
        } else {
          await savingGoalService.deallocateFromGoals(entries)
        }
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to adjust goals:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSpendEvenly = async () => {
    setIsSubmitting(true)
    try {
      await savingGoalService.deallocateEvenly(walletId, adjustAmount)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to deallocate evenly:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return null

  if (adjustAmount === 0 || (goals.length === 0 && open)) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Adjust Goals</DrawerTitle>
              <DrawerDescription>Nothing to adjust right now.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>{mode === 'allocate' ? 'Allocate to Goals' : 'Adjust Goals'}</DrawerTitle>
            <DrawerDescription>
              {mode === 'allocate'
                ? `Distribute ${formatCurrency(adjustAmount)} across your savings goals.`
                : `Goals exceed balance by ${formatCurrency(adjustAmount)}. Choose which goals to reduce.`
              }
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-2 flex flex-col gap-5 max-h-[50vh] overflow-y-auto">
            {goals.map(goal => {
              const maxForGoal = mode === 'allocate'
                ? Math.min(
                    Math.round((goal.targetAmount - goal.allocatedAmount) * 100) / 100,
                    Math.round((amounts[goal._id] + remaining) * 100) / 100,
                  )
                : Math.min(
                    goal.allocatedAmount,
                    Math.round((amounts[goal._id] + remaining) * 100) / 100,
                  )
              const currentAmount = amounts[goal._id] || 0

              return (
                <div key={goal._id} className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{goal.name}</span>
                    <span className="text-muted-foreground">
                      {mode === 'allocate'
                        ? `${formatCurrency(goal.allocatedAmount)} / ${formatCurrency(goal.targetAmount)}`
                        : `Allocated: ${formatCurrency(goal.allocatedAmount)}`
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[currentAmount]}
                      min={0}
                      max={Math.max(maxForGoal, 0)}
                      step={0.01}
                      onValueChange={(value) => handleSliderChange(goal._id, value)}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-20 text-right">
                      {formatCurrency(currentAmount)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-4 py-4">
            <div className="flex justify-between text-sm font-medium border-t pt-4">
              <span>{mode === 'allocate' ? 'Remaining unallocated' : 'Remaining to adjust'}</span>
              <span className={mode === 'deallocate' && remaining > 0 ? 'text-destructive' : ''}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>

          <DrawerFooter className="border-t-0">
            {mode === 'allocate' ? (
              <>
                <Button onClick={handleSubmit} disabled={isSubmitting || totalAdjusted === 0}>
                  {isSubmitting ? 'Allocating...' : 'Allocate'}
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Skip
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Adjusting...' : 'Confirm'}
                </Button>
                <Button variant="outline" onClick={handleSpendEvenly} disabled={isSubmitting}>
                  Spend from all goals evenly
                </Button>
              </>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
