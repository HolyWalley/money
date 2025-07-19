import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { DatePicker } from './DatePicker'
import type { PeriodFilter, PeriodType } from '@/hooks/useLiveTransactions'

interface PeriodFilterDrawerProps {
  isOpen: boolean
  currentPeriod: PeriodFilter
  onClose: (selectedPeriod?: PeriodFilter) => void
}

export function PeriodFilterDrawer({ isOpen, currentPeriod, onClose }: PeriodFilterDrawerProps) {
  const [selectedType, setSelectedType] = useState<PeriodType>(currentPeriod.type)
  const [monthDay, setMonthDay] = useState<string>(currentPeriod.monthDay?.toString() || '1')
  const [weekDay, setWeekDay] = useState<string>(currentPeriod.weekDay?.toString() || '1') // Monday = 1
  const [yearDay, setYearDay] = useState<string>(currentPeriod.yearDay?.toString() || '1')
  const [customFrom, setCustomFrom] = useState<Date | undefined>(currentPeriod.customFrom)
  const [customTo, setCustomTo] = useState<Date | undefined>(currentPeriod.customTo)

  const periodTypes = [
    { value: 'monthly' as PeriodType, label: 'Monthly', needsStartDate: true },
    { value: 'weekly' as PeriodType, label: 'Weekly', needsStartDate: true },
    { value: 'yearly' as PeriodType, label: 'Yearly', needsStartDate: true },
    { value: 'last7days' as PeriodType, label: 'Last 7 days', needsStartDate: false },
    { value: 'last30days' as PeriodType, label: 'Last 30 days', needsStartDate: false },
    { value: 'last365days' as PeriodType, label: 'Last 365 days', needsStartDate: false },
    { value: 'custom' as PeriodType, label: 'Custom Period', needsStartDate: false },
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

  const handleApply = () => {
    let newPeriod: PeriodFilter

    if (selectedType === 'custom') {
      newPeriod = {
        type: selectedType,
        customFrom,
        customTo
      }
    } else if (selectedType === 'monthly') {
      newPeriod = {
        type: selectedType,
        startDate: new Date(),
        currentPeriod: 0,
        monthDay: parseInt(monthDay)
      }
    } else if (selectedType === 'weekly') {
      newPeriod = {
        type: selectedType,
        startDate: new Date(),
        currentPeriod: 0,
        weekDay: parseInt(weekDay)
      }
    } else if (selectedType === 'yearly') {
      newPeriod = {
        type: selectedType,
        startDate: new Date(),
        currentPeriod: 0,
        yearDay: parseInt(yearDay)
      }
    } else {
      newPeriod = {
        type: selectedType
      }
    }

    onClose(newPeriod)
  }

  const handleCancel = () => {
    onClose()
  }

  const handleClearFilter = () => {
    onClose(undefined)
  }

  const isApplyDisabled = () => {
    if (selectedType === 'custom') {
      return !customFrom || !customTo
    }
    return false
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Select Period</DrawerTitle>
          <DrawerDescription>
            Choose how you want to filter transactions by date
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 pb-4 space-y-6 overflow-y-auto">
          {/* Period-specific controls */}
          {selectedType === 'monthly' && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Month Start Day</Label>
              <Select value={monthDay} onValueChange={setMonthDay}>
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
              <Select value={weekDay} onValueChange={setWeekDay}>
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
              <Select value={yearDay} onValueChange={setYearDay}>
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
                  onChange={setCustomFrom}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-3">
                <Label className="text-sm font-medium">To Date</Label>
                <DatePicker
                  value={customTo || new Date()}
                  onChange={setCustomTo}
                  className="w-full"
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-sm font-medium">Period Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {periodTypes.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={selectedType === type.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedType(type.value)}
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

          <Separator />
          
          <div className="flex gap-3 pt-2">
            <Button onClick={handleApply} disabled={isApplyDisabled()} className="flex-1">
              Apply Filter
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleClearFilter}>
              Clear Filter
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
