import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { DatePicker } from './DatePicker'
import type { TransactionFilters, PeriodFilter, PeriodType } from '@/hooks/useLiveTransactions'

interface FiltersDrawerProps {
  isOpen: boolean
  currentFilters: TransactionFilters
  onClose: () => void
  onFiltersChange: (filters: TransactionFilters) => void
}

export function FiltersDrawer({ isOpen, currentFilters, onClose, onFiltersChange }: FiltersDrawerProps) {
  const { categories } = useLiveCategories()
  const { wallets } = useLiveWallets()

  const { watch, setValue } = useForm<TransactionFilters>({
    defaultValues: {
      ...currentFilters,
      period: currentFilters.period || {
        type: 'monthly' as PeriodType,
        startDate: new Date(),
        currentPeriod: 0,
        monthDay: 1
      }
    }
  })

  // Period state
  const [selectedType, setSelectedType] = useState<PeriodType>(currentFilters.period?.type || 'monthly')
  const [monthDay, setMonthDay] = useState<string>(currentFilters.period?.monthDay?.toString() || '1')
  const [weekDay, setWeekDay] = useState<string>(currentFilters.period?.weekDay?.toString() || '1')
  const [yearDay, setYearDay] = useState<string>(currentFilters.period?.yearDay?.toString() || '1')
  const [customFrom, setCustomFrom] = useState<Date | undefined>(currentFilters.period?.customFrom)
  const [customTo, setCustomTo] = useState<Date | undefined>(currentFilters.period?.customTo)

  const formFilters = watch()

  // Apply filters immediately when form data changes
  useEffect(() => {
    onFiltersChange(formFilters)
  }, [formFilters.categoryIds, formFilters.walletIds, formFilters.period, onFiltersChange])

  const periodTypes = [
    { value: 'monthly' as PeriodType, label: 'Monthly' },
    { value: 'weekly' as PeriodType, label: 'Weekly' },
    { value: 'yearly' as PeriodType, label: 'Yearly' },
    { value: 'last7days' as PeriodType, label: 'Last 7 days' },
    { value: 'last30days' as PeriodType, label: 'Last 30 days' },
    { value: 'last365days' as PeriodType, label: 'Last 365 days' },
    { value: 'custom' as PeriodType, label: 'Custom Period' },
  ]

  const weekDays = [
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
    { value: '0', label: 'Sunday' },
  ]

  const monthDays = Array.from({ length: 30 }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Day ${i + 1}`
  }))

  const yearDays = Array.from({ length: 365 }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Day ${i + 1}`
  }))

  const handlePeriodTypeChange = (type: PeriodType) => {
    setSelectedType(type)

    let newPeriod: PeriodFilter

    if (type === 'custom') {
      newPeriod = {
        type,
        customFrom,
        customTo
      }
    } else if (type === 'monthly') {
      newPeriod = {
        type,
        startDate: new Date(),
        currentPeriod: 0,
        monthDay: parseInt(monthDay)
      }
    } else if (type === 'weekly') {
      newPeriod = {
        type,
        startDate: new Date(),
        currentPeriod: 0,
        weekDay: parseInt(weekDay)
      }
    } else if (type === 'yearly') {
      newPeriod = {
        type,
        startDate: new Date(),
        currentPeriod: 0,
        yearDay: parseInt(yearDay)
      }
    } else {
      newPeriod = { type }
    }

    setValue('period', newPeriod)
  }

  const handleMonthDayChange = (day: string) => {
    setMonthDay(day)
    if (selectedType === 'monthly') {
      setValue('period', {
        type: 'monthly',
        startDate: new Date(),
        currentPeriod: 0,
        monthDay: parseInt(day)
      })
    }
  }

  const handleWeekDayChange = (day: string) => {
    setWeekDay(day)
    if (selectedType === 'weekly') {
      setValue('period', {
        type: 'weekly',
        startDate: new Date(),
        currentPeriod: 0,
        weekDay: parseInt(day)
      })
    }
  }

  const handleYearDayChange = (day: string) => {
    setYearDay(day)
    if (selectedType === 'yearly') {
      setValue('period', {
        type: 'yearly',
        startDate: new Date(),
        currentPeriod: 0,
        yearDay: parseInt(day)
      })
    }
  }

  const handleCustomFromChange = (date: Date | undefined) => {
    setCustomFrom(date)
    if (selectedType === 'custom') {
      setValue('period', {
        type: 'custom',
        customFrom: date,
        customTo
      })
    }
  }

  const handleCustomToChange = (date: Date | undefined) => {
    setCustomTo(date)
    if (selectedType === 'custom') {
      setValue('period', {
        type: 'custom',
        customFrom,
        customTo: date
      })
    }
  }

  const handleCategoryChange = (categoryId: string, checked: boolean) => {
    const currentIds = formFilters.categoryIds || []
    const newIds = checked
      ? [...currentIds, categoryId]
      : currentIds.filter(id => id !== categoryId)
    setValue('categoryIds', newIds)
  }

  const handleWalletChange = (walletId: string, checked: boolean) => {
    const currentIds = formFilters.walletIds || []
    const newIds = checked
      ? [...currentIds, walletId]
      : currentIds.filter(id => id !== walletId)
    setValue('walletIds', newIds)
  }



  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Filter Transactions</DrawerTitle>
          <DrawerDescription>
            Filter transactions by period, categories, and wallets
          </DrawerDescription>
        </DrawerHeader>

        <Tabs defaultValue="period" className="w-full">
          <div className="px-4 pb-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="period">Period</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="period" className="px-4 pb-4 space-y-4 overflow-y-auto max-h-[calc(90dvh-12rem)]">
            {selectedType === 'monthly' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Month Start Day</Label>
                <Select value={monthDay} onValueChange={handleMonthDayChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthDays.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedType === 'weekly' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Week Start Day</Label>
                <Select value={weekDay} onValueChange={handleWeekDayChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekDays.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedType === 'yearly' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Year Start Day</Label>
                <Select value={yearDay} onValueChange={handleYearDayChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {yearDays.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedType === 'custom' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">From Date</Label>
                  <DatePicker
                    value={customFrom || new Date()}
                    onChange={handleCustomFromChange}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">To Date</Label>
                  <DatePicker
                    value={customTo || new Date()}
                    onChange={handleCustomToChange}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-medium">Period Type</Label>
              <div className="flex flex-col gap-2">
                {periodTypes.map((type) => (
                  <Button
                    key={type.value}
                    type="button"
                    variant={selectedType === type.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePeriodTypeChange(type.value)}
                    className={cn(
                      "justify-start text-left h-auto py-3",
                      selectedType === type.value && "bg-primary text-primary-foreground"
                    )}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="filters" className="px-4 pb-4 space-y-4 overflow-y-auto max-h-[calc(90dvh-12rem)]">
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Categories</Label>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div key={category._id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category._id}`}
                        checked={(formFilters.categoryIds || []).includes(category._id)}
                        onCheckedChange={(checked) => handleCategoryChange(category._id, !!checked)}
                      />
                      <Label
                        htmlFor={`category-${category._id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {category.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Wallets</Label>
                <div className="space-y-2">
                  {wallets.map((wallet) => (
                    <div key={wallet._id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`wallet-${wallet._id}`}
                        checked={(formFilters.walletIds || []).includes(wallet._id)}
                        onCheckedChange={(checked) => handleWalletChange(wallet._id, !!checked)}
                      />
                      <Label
                        htmlFor={`wallet-${wallet._id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {wallet.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  )
}
