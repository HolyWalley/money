import { useState } from 'react'
import { Check, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { Form } from '@/components/ui/form'
import { TransactionForm } from './TransactionForm'
import { useTransactionForm } from '@/hooks/useTransactionForm'
import { formDefaults, type SaveMode } from '@/lib/form-defaults'
import { cn } from '@/lib/utils'
import { type CreateTransaction, type Transaction } from '../../../shared/schemas/transaction.schema'

interface TransactionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
  initialValues?: Partial<CreateTransaction>
  onSubmit: (data: CreateTransaction) => Promise<void>
  onDelete?: (id: string) => void
}

const SAVE_MODES: SaveMode[] = ['save', 'addAnother']

const SAVE_MODE_LABELS: Record<SaveMode, string> = {
  save: 'Save',
  addAnother: 'Save & add another',
}

export function TransactionDrawer({ open, onOpenChange, transaction, initialValues, onSubmit, onDelete }: TransactionDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saveMode, setSaveMode] = useState<SaveMode>(() => formDefaults.loadSaveMode())
  // Bumped after each saved entry to remount the form, which is what clears
  // the amount input: it holds its own state and does not follow a reset.
  const [entryCount, setEntryCount] = useState(0)
  const { form, resetToDefaults, resetForNextEntry } = useTransactionForm(transaction, initialValues)

  const isEditing = !!transaction

  // Closing ends the sitting: the next opening is a fresh first entry, which
  // should not steal focus into the amount the way a continued one does.
  const closeDrawer = () => {
    setEntryCount(0)
    onOpenChange(false)
  }

  const handleSubmit = async (data: CreateTransaction, mode: SaveMode) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)

      if (!isEditing) {
        formDefaults.saveWallet(data.transactionType, {
          walletId: data.walletId,
          toWalletId: data.toWalletId,
        })
        formDefaults.saveDate(data.date)
      }

      if (!isEditing && mode === 'addAnother') {
        resetForNextEntry()
        setEntryCount(count => count + 1)
        // The drawer stays put, so the toast is the only sign it worked.
        toast.success('Saved')
        return
      }

      closeDrawer()
      resetToDefaults()
    } catch (error) {
      console.error(`Failed to ${transaction ? 'update' : 'create'} transaction:`, error)
      console.error('Form errors:', form.formState.errors)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Picking from the menu saves straight away and becomes the new default, so
  // choosing a way to save is never a separate step from saving.
  const handleSelectSaveMode = (mode: SaveMode) => {
    setSaveMode(mode)
    formDefaults.saveSaveMode(mode)
    void form.handleSubmit(data => handleSubmit(data, mode))()
  }

  return (
    <Drawer open={open} onOpenChange={next => (next ? onOpenChange(true) : closeDrawer())}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>{transaction ? 'Edit Transaction' : 'New Transaction'}</DrawerTitle>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(data => handleSubmit(data, saveMode))} className="px-4 max-h-[50vh] overflow-y-auto group-data-[swipe-direction=right]/drawer-popup:max-h-[calc(100dvh-14rem)]">
              <div className="space-y-4 pb-6">
                <TransactionForm
                  key={entryCount}
                  isSubmitting={isSubmitting}
                  transaction={transaction}
                  autoFocusAmount={entryCount > 0}
                />
              </div>
            </form>
          </Form>
          <DrawerFooter>
            {/* `bg-clip-border` on both halves: buttons carry a transparent
                border clipped away from the background, which on a filled
                variant leaves the page showing through as a seam between
                them. The divider is drawn deliberately instead. */}
            {isEditing ? (
              <Button
                type="submit"
                size="lg"
                onClick={form.handleSubmit(data => handleSubmit(data, 'save'))}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Update'}
              </Button>
            ) : (
              <ButtonGroup className="w-full">
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1 bg-clip-border"
                  onClick={form.handleSubmit(data => handleSubmit(data, saveMode))}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : SAVE_MODE_LABELS[saveMode]}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-lg"
                        aria-label="Save options"
                        disabled={isSubmitting}
                        className="relative bg-clip-border before:absolute before:inset-y-1.5 before:left-0 before:w-px before:bg-primary-foreground/20"
                      />
                    }
                  >
                    <ChevronUp />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="end" className="w-56">
                    {SAVE_MODES.map(mode => (
                      <DropdownMenuItem key={mode} onClick={() => handleSelectSaveMode(mode)}>
                        <Check className={cn(mode !== saveMode && 'invisible')} />
                        {SAVE_MODE_LABELS[mode]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            )}
            {transaction && onDelete && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting}
                >
                  Delete Transaction
                </Button>
              </>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>

      <ConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Transaction"
        description="Are you sure you want to delete this transaction? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (transaction && onDelete) {
            onDelete(transaction._id)
            closeDrawer()
          }
        }}
      />
    </Drawer>
  )
}
