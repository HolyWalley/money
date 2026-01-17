import { useState, useEffect, useMemo } from 'react'
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
import { buildRRule, parseRRuleToOptions, type Frequency } from '@/lib/recurring-utils'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import type { RecurringPayment } from '../../../shared/schemas/recurring-payment.schema'

const formSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().min(1).max(365),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(-1).max(31).optional(),
  startDate: z.string(),
  hasEndDate: z.boolean(),
  endDate: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface RecurringPaymentEditDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: RecurringPayment | null
  onSuccess?: () => void
}

export function RecurringPaymentEditDrawer({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: RecurringPaymentEditDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parsedOptions = useMemo(() => {
    if (!payment) return null
    return parseRRuleToOptions(payment.rrule)
  }, [payment])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      frequency: 'monthly',
      interval: 1,
      dayOfWeek: undefined,
      dayOfMonth: undefined,
      startDate: new Date().toISOString(),
      hasEndDate: false,
      endDate: undefined,
    },
  })

  useEffect(() => {
    if (open && payment && parsedOptions) {
      form.reset({
        frequency: parsedOptions.frequency,
        interval: parsedOptions.interval,
        dayOfWeek: parsedOptions.dayOfWeek,
        dayOfMonth: parsedOptions.dayOfMonth,
        startDate: payment.startDate,
        hasEndDate: !!parsedOptions.endDate,
        endDate: parsedOptions.endDate,
      })
    }
  }, [open, payment, parsedOptions, form])

  const handleSubmit = async (data: FormValues) => {
    if (!payment) return

    setIsSubmitting(true)
    try {
      const rrule = buildRRule({
        frequency: data.frequency as Frequency,
        interval: data.interval,
        dayOfWeek: data.frequency === 'weekly' ? data.dayOfWeek : undefined,
        dayOfMonth: data.frequency === 'monthly' ? data.dayOfMonth : undefined,
        endDate: data.hasEndDate && data.endDate ? new Date(data.endDate) : undefined,
      })

      await recurringPaymentService.updateRecurringPaymentDetails(payment._id, {
        rrule,
        startDate: data.startDate,
        endDate: data.hasEndDate && data.endDate ? data.endDate : undefined,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to update recurring payment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!payment) return null

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Edit Recurring Payment</DrawerTitle>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4 max-h-[50vh] overflow-y-auto">
              <div className="space-y-4 pb-6">
                <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{payment.description || 'Payment'}</p>
                  <p className="text-muted-foreground">
                    {payment.amount.toFixed(2)} {payment.currency}
                  </p>
                </div>
                <RecurringPaymentForm />
              </div>
            </form>
          </Form>
          <DrawerFooter>
            <Button
              type="submit"
              onClick={form.handleSubmit(handleSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
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
