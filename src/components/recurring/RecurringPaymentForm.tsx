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

interface RecurringPaymentFormValues {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  dayOfWeek?: number
  dayOfMonth?: number
  startDate: string
  hasEndDate: boolean
  endDate?: string
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

const DAY_OF_MONTH_OPTIONS = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  })),
  { value: '-1', label: 'Last day' },
]

export function RecurringPaymentForm() {
  const form = useFormContext<RecurringPaymentFormValues>()
  const frequency = form.watch('frequency')
  const hasEndDate = form.watch('hasEndDate')

  const getIntervalLabel = () => {
    switch (frequency) {
      case 'daily':
        return 'days'
      case 'weekly':
        return 'weeks'
      case 'monthly':
        return 'months'
      case 'yearly':
        return 'years'
      default:
        return 'periods'
    }
  }

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="frequency"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Frequency</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="interval"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Every</FormLabel>
            <div className="flex items-center gap-2">
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              </FormControl>
              <span className="text-sm text-muted-foreground">{getIntervalLabel()}</span>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {frequency === 'weekly' && (
        <FormField
          control={form.control}
          name="dayOfWeek"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Day of week</FormLabel>
              <Select
                onValueChange={(val) => field.onChange(parseInt(val))}
                value={field.value?.toString()}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
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
              <FormMessage />
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
              <FormLabel>Day of month</FormLabel>
              <Select
                onValueChange={(val) => field.onChange(parseInt(val))}
                value={field.value?.toString()}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
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
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Start date</FormLabel>
            <FormControl>
              <DatePicker
                value={field.value ? new Date(field.value) : new Date()}
                onChange={(date) => field.onChange(date.toISOString())}
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
                  onChange={(date) => field.onChange(date.toISOString())}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
