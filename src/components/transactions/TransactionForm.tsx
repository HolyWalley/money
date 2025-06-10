import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { AmountInput } from './AmountInput'
import { CategorySelector } from './CategorySelector'
import { DatePicker } from './DatePicker'

interface TransactionFormProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean
}

export function TransactionForm({ form, isSubmitting }: TransactionFormProps) {
  const { wallets } = useLiveWallets()
  const { categories } = useLiveCategories()
  const transactionType = form.watch('transactionType')

  return (
    <>
      <AmountInput form={form} isSubmitting={isSubmitting} />

      <div className="space-y-2">
        <ToggleGroup
          type="single"
          value={form.watch('transactionType')}
          onValueChange={(value) => {
            if (value) {
              form.setValue('transactionType', value as 'income' | 'expense' | 'transfer')
              // Clear category/wallet fields when switching types
              if (value === 'transfer') {
                form.setValue('categoryId', undefined)
              } else {
                form.setValue('toWalletId', undefined)
              }
            }
          }}
          disabled={isSubmitting}
          className="w-full gap-2 bg-transparent p-0"
          size="sm"
        >
          <ToggleGroupItem 
            value="expense" 
            aria-label="Expense"
            className="flex-1 !rounded-full uppercase text-xs transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:bg-muted hover:text-foreground"
          >
            Expense
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="income" 
            aria-label="Income"
            className="flex-1 !rounded-full uppercase text-xs transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:bg-muted hover:text-foreground"
          >
            Income
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="transfer" 
            aria-label="Transfer"
            className="flex-1 !rounded-full uppercase text-xs transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:bg-muted hover:text-foreground"
          >
            Transfer
          </ToggleGroupItem>
        </ToggleGroup>
        {form.formState.errors.transactionType && (
          <p className="text-sm text-destructive">{form.formState.errors.transactionType.message}</p>
        )}
      </div>

      {(transactionType === 'income' || transactionType === 'expense') && (
        <div className="space-y-2">
          <Label>Category</Label>
          <CategorySelector
            categories={categories
              .filter((category) => category.type === transactionType)
              .sort((a, b) => a.order - b.order)
            }
            selectedCategoryId={form.watch('categoryId')}
            onCategorySelect={(categoryId) => form.setValue('categoryId', categoryId)}
            disabled={isSubmitting}
          />
          {form.formState.errors.categoryId && (
            <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
          )}
        </div>
      )}


      <div className="space-y-2">
        <Label htmlFor="walletId">From Wallet</Label>
        <Select
          value={form.watch('walletId')}
          onValueChange={(value) => form.setValue('walletId', value)}
          disabled={isSubmitting}
        >
          <SelectTrigger id="walletId" className="w-full">
            <SelectValue placeholder="Select wallet" />
          </SelectTrigger>
          <SelectContent>
            {wallets.map((wallet) => (
              <SelectItem key={wallet._id} value={wallet._id}>
                {wallet.name} <span className="text-muted-foreground">({wallet.currency})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.walletId && (
          <p className="text-sm text-destructive">{form.formState.errors.walletId.message}</p>
        )}
      </div>

      {transactionType === 'transfer' && (
        <div className="space-y-2">
          <Label htmlFor="toWalletId">To Wallet</Label>
          <Select
            value={form.watch('toWalletId')}
            onValueChange={(value) => form.setValue('toWalletId', value)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="toWalletId" className="w-full">
              <SelectValue placeholder="Select destination wallet" />
            </SelectTrigger>
            <SelectContent>
              {wallets.filter(w => w._id !== form.watch('walletId')).map((wallet) => (
                <SelectItem key={wallet._id} value={wallet._id}>
                  {wallet.name} <span className="text-muted-foreground">({wallet.currency})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.toWalletId && (
            <p className="text-sm text-destructive">{form.formState.errors.toWalletId.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Date</Label>
        <DatePicker
          value={(() => {
            try {
              const dateValue = form.watch('date')
              return dateValue ? new Date(dateValue) : new Date()
            } catch {
              return new Date()
            }
          })()}
          onChange={(date) => {
            form.setValue('date', date.toISOString())
          }}
          disabled={isSubmitting}
          className="w-full"
        />
        {form.formState.errors.date && (
          <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          {...form.register('note')}
          placeholder="e.g., Grocery shopping, Salary, Coffee"
          disabled={isSubmitting}
          className="w-full"
        />
        {form.formState.errors.note && (
          <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>
        )}
      </div>
    </>
  )
}
