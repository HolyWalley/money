import { useEffect, useMemo, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

import {
  FormField,
  FormItem,
  FormLabel,
  FormControl
} from "@/components/ui/form"

import { Button } from "@/components/ui/button";

// TODO: Should we distinguish between create/edit?
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { Checkbox } from '@/components/ui/checkbox'
import { Split } from 'lucide-react';
import { Slider } from '../ui/slider';

export function SplitDrawer() {
  const [open, setOpen] = useState(false)
  const form = useFormContext<CreateTransaction>()

  const split = form.watch('split')
  const parts = form.watch('parts')
  const amount = form.watch('amount') || 0

  useEffect(() => {
    if (split && parts?.length === 0) {
      const half = (amount || 0) * 0.5
      form.setValue(
        'parts',
        [{ amount: half }, { amount: half }]
      )
    }
  }, [form, amount, split, parts])

  // Recalculate parts when amount changes
  useEffect(() => {
    if (parts?.length !== 2) {
      return
    }

    const prevAmount = (parts[0]?.amount || 0) + (parts[1]?.amount || 0)
    const ratio = (amount || 0) / prevAmount
    const newParts = parts.map(part => ({
      amount: parseFloat((part.amount * ratio).toFixed(2))
    }))

    form.setValue('parts', newParts)
  }, [amount])

  return <Drawer open={open} onOpenChange={setOpen} repositionInputs={false}>
    <div className="flex items-center justify-between min-h-8">
      <FormField
        control={form.control}
        name="split"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  if (checked) {
                    setOpen(true)
                  }
                }}
              />
            </FormControl>
            <FormLabel className="text-sm font-normal">
              Split with others {split && <span className="text-muted-foreground">({parts?.at(0)?.amount || 0} / {parts?.at(1)?.amount || 0})</span>}
            </FormLabel>
          </FormItem>
        )}
      >
      </FormField>
      {split && (
        <DrawerTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setOpen(true)}>
            <Split />
          </Button>
        </DrawerTrigger>
      )}
    </div>

    <DrawerContent>
      <div className="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle>Split</DrawerTitle>
          <DrawerDescription>Only your share will be used in statistics</DrawerDescription>
        </DrawerHeader>

        <div className="p-4">
          <FormField control={form.control} name='parts.0.amount' render={({ field }) => (
            <FormItem className="mb-4">
              <FormControl>
                <div className="flex items-center gap-2">
                  <FormLabel>Me</FormLabel>
                  <Slider
                    value={[parts?.at(0)?.amount || 0]}
                    max={amount}
                    step={0.01}
                    onValueChange={(value) => {
                      const newAmount = value[0]
                      field.onChange(newAmount)
                      form.setValue('parts', [{ amount: newAmount }, { amount: parseFloat((amount - newAmount).toFixed(2)) }])
                    }}
                  />

                  <input
                    className="w-[5ch] text-right"
                    value={parts?.at(0)?.amount || 0}
                    type="number"
                    inputMode="decimal"
                    max={amount}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value)
                      let newAmount
                      if (!isNaN(value) && value <= amount) {
                        newAmount = value
                      } else {
                        newAmount = 0
                      }
                      field.onChange(newAmount)
                      form.setValue('parts', [{ amount: newAmount }, { amount: parseFloat((amount - newAmount).toFixed(2)) }])
                    }}
                  />
                </div>
              </FormControl>
            </FormItem>
          )} />

          <div className="flex items-center gap-2">
            <FormLabel>Others</FormLabel>
            <Slider max={amount} value={[parts?.at(1)?.amount || 0]} disabled />

            <input
              className="w-[5ch] text-right"
              value={(parts?.at(1)?.amount || 0).toFixed(2)}
              type="number"
              inputMode="decimal"
              disabled
            />
          </div>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Back</Button>
          </DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
}
