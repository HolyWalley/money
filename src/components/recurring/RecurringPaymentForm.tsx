import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/transactions/DatePicker'
import { Checkbox } from '@/components/ui/checkbox'
import { useLiveWallets } from '@/hooks/useLiveWallets'

interface RecurringPaymentFormValues {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  dayOfWeek?: number
  dayOfMonth?: number
  startDate: string
  hasEndDate: boolean
  endDate?: string
  saveUp: boolean
  savingsWalletId?: string
}

const DAY_OF_WEEK_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const DAY_OF_MONTH_OPTIONS = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
  })),
  { value: '-1', label: 'Last day' },
]

interface RecurringPaymentFormProps {
  rpCurrency: string
}

export function RecurringPaymentForm({ rpCurrency }: RecurringPaymentFormProps) {
  const form = useFormContext<RecurringPaymentFormValues>()
  const frequency = form.watch('frequency')
  const hasEndDate = form.watch('hasEndDate')
  const saveUp = form.watch('saveUp')
  const { wallets } = useLiveWallets()

  const savingsWallets = wallets.filter(
    (w) => w.isSavings === true && w.currency === rpCurrency
  )

  useEffect(() => {
    if (!saveUp) {
      form.setValue('savingsWalletId', undefined)
    }
  }, [saveUp, form])

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <FormField
          control={form.control}
          name="interval"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Every</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  className="w-14 h-9 text-center"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="frequency"
          render={({ field }) => (
            <FormItem>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-auto h-9">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="daily">day(s)</SelectItem>
                  <SelectItem value="weekly">week(s)</SelectItem>
                  <SelectItem value="monthly">month(s)</SelectItem>
                  <SelectItem value="yearly">year(s)</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {frequency === 'weekly' && (
          <FormField
            control={form.control}
            name="dayOfWeek"
            render={({ field }) => (
              <FormItem>
                <FormLabel>on</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(parseInt(val))}
                  value={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger className="w-auto h-9">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DAY_OF_WEEK_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {frequency === 'monthly' && (
          <FormField
            control={form.control}
            name="dayOfMonth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>on</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(parseInt(val))}
                  value={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger className="w-auto h-9">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DAY_OF_MONTH_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}
      </div>

      <FormField
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Start date</FormLabel>
            <FormControl>
              <DatePicker
                value={field.value ? new Date(field.value) : new Date()}
                onChange={(date) => { if (date) field.onChange(date.toISOString()) }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="hasEndDate"
        render={({ field }) => (
          <FormItem className="flex items-center gap-3 rounded-lg border p-3">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <FormLabel className="text-sm font-medium cursor-pointer">Set end date</FormLabel>
          </FormItem>
        )}
      />

      {hasEndDate && (
        <FormField
          control={form.control}
          name="endDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>End date</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value ? new Date(field.value) : new Date()}
                  onChange={(date) => { if (date) field.onChange(date.toISOString()) }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="saveUp"
        render={({ field }) => (
          <FormItem className="flex items-center gap-3 rounded-lg border p-3">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <FormLabel className="text-sm font-medium cursor-pointer">
              Save up for this in a savings wallet
            </FormLabel>
          </FormItem>
        )}
      />

      {saveUp && (
        <FormField
          control={form.control}
          name="savingsWalletId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Savings wallet</FormLabel>
              {savingsWallets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No savings wallets match this currency
                </p>
              ) : (
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select a savings wallet" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {savingsWallets.map((wallet) => (
                      <SelectItem key={wallet._id} value={wallet._id}>
                        {wallet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
