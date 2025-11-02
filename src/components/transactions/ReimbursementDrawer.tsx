import { useFormContext } from 'react-hook-form'

import {
  FormField,
  FormItem,
  FormLabel,
  FormControl
} from "@/components/ui/form"

// TODO: Should we distinguish between create/edit?
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { Checkbox } from '@/components/ui/checkbox'

export function ReimbursementDrawer() {
  const form = useFormContext<CreateTransaction>()

  return <div className="flex items-center justify-between min-h-8">
    <FormField
      control={form.control}
      name="reimbursement"
      render={({ field }) => (
        <FormItem className="flex flex-row items-center gap-2">
          <FormControl>
            <Checkbox
              checked={field.value ?? false}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          </FormControl>
          <FormLabel className="text-sm font-normal">
            Reimbursement or refund?
          </FormLabel>
        </FormItem>
      )}
    >
    </FormField>
  </div>
}
