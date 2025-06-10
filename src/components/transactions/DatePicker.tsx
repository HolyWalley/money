import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { format, addDays, subDays, isToday, isYesterday, isTomorrow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: Date
  onChange: (date: Date) => void
  disabled?: boolean
  className?: string
}

export function DatePicker({ value, onChange, disabled, className }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handlePreviousDay = () => {
    const newDate = subDays(value, 1)
    onChange(newDate)
  }

  const handleNextDay = () => {
    const newDate = addDays(value, 1)
    onChange(newDate)
  }

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    if (isTomorrow(date)) return 'Tomorrow'
    return format(date, 'MMM dd, yyyy')
  }

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange(selectedDate)
      setIsOpen(false)
    }
  }

  return (
    <div className={cn("flex items-center justify-between rounded-lg border bg-card px-3 py-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handlePreviousDay}
        disabled={disabled}
        className="h-8 w-8 p-0 hover:bg-accent"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous day</span>
      </Button>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            className="flex-1 justify-center font-medium hover:bg-accent"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {getDateLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleCalendarSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleNextDay}
        disabled={disabled}
        className="h-8 w-8 p-0 hover:bg-accent"
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next day</span>
      </Button>
    </div>
  )
}