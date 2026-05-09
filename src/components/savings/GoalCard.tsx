import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash, Check, Undo } from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { savingGoalService } from '@/services/savingGoalService'
import { getSavingsSuggestion } from '@/lib/savings-suggestion'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

interface GoalCardProps {
  goal: SavingGoal
  currency: string
  onEdit: () => void
}

export function GoalCard({ goal, currency, onEdit }: GoalCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const percentage = goal.targetAmount > 0
    ? Math.min(Math.round((goal.allocatedAmount / goal.targetAmount) * 100), 100)
    : 0

  const isFullyFunded = goal.allocatedAmount >= goal.targetAmount
  const suggestion = getSavingsSuggestion(goal)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const handleToggleAchieved = async () => {
    await savingGoalService.updateGoal(goal._id, { achieved: !goal.achieved })
  }

  const handleDelete = async () => {
    await savingGoalService.deleteGoal(goal._id)
  }

  return (
    <>
      <Card className={goal.achieved ? 'opacity-75' : undefined}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            {goal.name}
            {goal.achieved && (
              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded">
                Achieved
              </span>
            )}
            {!goal.achieved && isFullyFunded && (
              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded">
                Fully funded
              </span>
            )}
            {!goal.achieved && !isFullyFunded && suggestion.status === 'overdue' && (
              <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-1.5 py-0.5 rounded">
                Overdue
              </span>
            )}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleAchieved}>
                {goal.achieved ? (
                  <>
                    <Undo className="mr-2 h-4 w-4" />
                    Mark as Active
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Mark as Achieved
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{formatCurrency(goal.allocatedAmount)}</span>
            <span className="text-muted-foreground">{formatCurrency(goal.targetAmount)}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                goal.achieved
                  ? 'bg-green-500'
                  : isFullyFunded
                    ? 'bg-blue-500'
                    : 'bg-primary'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{percentage}%</p>
          {goal.targetDate && !goal.achieved && suggestion.status !== 'fully-funded' && (() => {
            const formattedDate = format(new Date(goal.targetDate), 'MMM d, yyyy')
            let text: string | null = null
            if (suggestion.status === 'on-track') {
              text = `Suggested: ~${formatCurrency(suggestion.monthlyAmount)} / month — by ${formattedDate}`
            } else if (suggestion.status === 'under-month') {
              text = `${formatCurrency(suggestion.remainingAmount)} to go — under a month left (${formattedDate})`
            } else if (suggestion.status === 'overdue') {
              text = `${formatCurrency(suggestion.remainingAmount)} short — was due ${formattedDate}`
            }
            return text ? <p className="text-xs text-muted-foreground">{text}</p> : null
          })()}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Goal"
        description={`Are you sure you want to delete "${goal.name}"? The allocated amount will become unallocated.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  )
}
