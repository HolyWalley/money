import { useState, useEffect, useMemo } from 'react'
import { useForm, useFormContext } from 'react-hook-form'
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RecurringPaymentForm } from './RecurringPaymentForm'
import { MoneyInput } from '@/components/transactions/MoneyInput'
import { WalletSelector } from '@/components/transactions/WalletSelector'
import { buildRRule, parseRRuleToOptions, type Frequency } from '@/lib/recurring-utils'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import { CurrencyEnum } from '../../../shared/schemas/user_settings.schema'
import type { RecurringPayment } from '../../../shared/schemas/recurring-payment.schema'

const formSchema = z
  .object({
    amount: z.number().positive('Amount must be positive'),
    currency: CurrencyEnum,
    walletId: z.string().min(1, 'Please select a wallet'),
    note: z.string().max(200, 'Note is too long').optional(),
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

interface RecurringPaymentEditDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: RecurringPayment | null
  onSuccess?: () => void
}

function PaymentDetailsFields({ isSubmitting }: { isSubmitting: boolean }) {
  const form = useFormContext<FormValues>()
  const amount = form.watch('amount')
  const currency = form.watch('currency')
  const walletId = form.watch('walletId')
  const { wallets } = useLiveWallets()

  useEffect(() => {
    const wallet = wallets.find(w => w._id === walletId)
    if (wallet && wallet.currency !== currency) {
      form.setValue('currency', wallet.currency, { shouldValidate: true })
    }
  }, [currency, form, walletId, wallets])

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3">
      <div className="w-full">
        <WalletSelector
          wallets={wallets}
          isSubmitting={isSubmitting}
          fieldName="walletId"
          placeholder="Select wallet"
        />
      </div>

      <FormField
        control={form.control}
        name="amount"
        render={() => (
          <FormItem>
            <FormLabel>Price</FormLabel>
            <FormControl>
              <div className="rounded-lg bg-muted/50 p-2">
                <label className="flex items-center justify-center gap-3">
                  <MoneyInput
                    className="text-3xl font-bold"
                    defaultValue={amount}
                    onChange={(value) => form.setValue('amount', value, { shouldValidate: true })}
                    disabled={isSubmitting}
                  />
                  <span className="text-3xl font-bold">{currency}</span>
                </label>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Note</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., Rent, Salary, Subscription"
                disabled={isSubmitting}
                className="w-full"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
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
      amount: undefined as unknown as number,
      currency: 'USD',
      walletId: '',
      note: '',
      frequency: 'monthly',
      interval: 1,
      dayOfWeek: undefined,
      dayOfMonth: undefined,
      startDate: new Date().toISOString(),
      hasEndDate: false,
      endDate: undefined,
      saveUp: false,
      savingsWalletId: undefined,
    },
  })

  const editedCurrency = form.watch('currency')

  useEffect(() => {
    if (open && payment && parsedOptions) {
      form.reset({
        amount: payment.amount,
        currency: payment.currency,
        walletId: payment.walletId,
        note: payment.description || '',
        frequency: parsedOptions.frequency,
        interval: parsedOptions.interval,
        dayOfWeek: parsedOptions.dayOfWeek,
        dayOfMonth: parsedOptions.dayOfMonth,
        startDate: payment.startDate,
        hasEndDate: !!parsedOptions.endDate,
        endDate: parsedOptions.endDate,
        saveUp: !!payment.savingsWalletId,
        savingsWalletId: payment.savingsWalletId,
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
        amount: data.amount,
        currency: data.currency,
        walletId: data.walletId,
        description: data.note?.trim() ? data.note : undefined,
        rrule,
        startDate: data.startDate,
        endDate: data.hasEndDate && data.endDate ? data.endDate : undefined,
        savingsWalletId: data.saveUp && data.savingsWalletId ? data.savingsWalletId : undefined,
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
              <Accordion type="single" defaultValue="schedule" collapsible className="pb-6">
                <AccordionItem value="payment-details">
                  <AccordionTrigger>Payment details</AccordionTrigger>
                  <AccordionContent>
                    <PaymentDetailsFields isSubmitting={isSubmitting} />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="schedule">
                  <AccordionTrigger>Schedule</AccordionTrigger>
                  <AccordionContent>
                    <RecurringPaymentForm rpCurrency={editedCurrency} section="schedule" />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="savings">
                  <AccordionTrigger>Savings</AccordionTrigger>
                  <AccordionContent>
                    <RecurringPaymentForm rpCurrency={editedCurrency} section="savings" />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
