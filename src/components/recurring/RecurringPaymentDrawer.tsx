import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Form } from '@/components/ui/form'
import { RecurringPaymentForm } from './RecurringPaymentForm'
import { buildRRule, type Frequency } from '@/lib/recurring-utils'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import type { Transaction } from '../../../shared/schemas/transaction.schema'

const formSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().min(1).max(365),
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(-1).max(31).optional(),
    startDate: z.string(),
    hasEndDate: z.boolean(),
    endDate: z.string().optional(),
    saveUp: z.boolean(),
    savingsWalletId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.saveUp && !data.savingsWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please select a savings wallet',
        path: ['savingsWalletId'],
      })
    }
  })

type FormValues = z.infer<typeof formSchema>

interface RecurringPaymentDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction
  onSuccess?: () => void
}

export function RecurringPaymentDrawer({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: RecurringPaymentDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const transactionDate = useMemo(() => new Date(transaction.date), [transaction.date])
  const dayOfWeek = transactionDate.getDay()
  const dayOfMonth = transactionDate.getDate()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      frequency: 'monthly',
      interval: 1,
      dayOfWeek,
      dayOfMonth,
      startDate: transaction.date,
      hasEndDate: false,
      endDate: undefined,
      saveUp: false,
      savingsWalletId: undefined,
    },
  })

  useEffect(() => {
    if (open) {
      const date = new Date(transaction.date)
      form.reset({
        frequency: 'monthly',
        interval: 1,
        dayOfWeek: date.getDay(),
        dayOfMonth: date.getDate(),
        startDate: transaction.date,
        hasEndDate: false,
        endDate: undefined,
        saveUp: false,
        savingsWalletId: undefined,
      })
    }
  }, [open, transaction.date, form])

  const handleSubmit = async (data: FormValues) => {
    setIsSubmitting(true)
    try {
      const rrule = buildRRule({
        frequency: data.frequency as Frequency,
        interval: data.interval,
        dayOfWeek: data.frequency === 'weekly' ? data.dayOfWeek : undefined,
        dayOfMonth: data.frequency === 'monthly' ? data.dayOfMonth : undefined,
        endDate: data.hasEndDate && data.endDate ? new Date(data.endDate) : undefined,
      })

      const created = await recurringPaymentService.createFromTransaction(
        transaction._id,
        rrule,
        data.startDate
      )

      if (data.saveUp && data.savingsWalletId) {
        await recurringPaymentService.updateRecurringPaymentDetails(created._id, {
          savingsWalletId: data.savingsWalletId,
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to create recurring payment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Make Recurring</DrawerTitle>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4 max-h-[50vh] overflow-y-auto">
              <div className="space-y-4 pb-6">
                <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{transaction.note || 'Transaction'}</p>
                  <p className="text-muted-foreground">
                    {transaction.amount.toFixed(2)} {transaction.currency}
                  </p>
                </div>
                <RecurringPaymentForm rpCurrency={transaction.currency} />
              </div>
            </form>
          </Form>
          <DrawerFooter>
            <Button
              type="submit"
              onClick={form.handleSubmit(handleSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Recurring Payment'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
