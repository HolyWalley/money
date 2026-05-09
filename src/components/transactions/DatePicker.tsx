import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react'
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
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  disabled?: boolean
  className?: string
  clearable?: boolean
  placeholder?: string
}

export function DatePicker({ value, onChange, disabled, className, clearable, placeholder = 'Pick a date' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handlePreviousDay = () => {
    if (!value) return
    onChange(subDays(value, 1))
  }

  const handleNextDay = () => {
    if (!value) return
    onChange(addDays(value, 1))
  }

  const getDateLabel = (date: Date | undefined) => {
    if (!date) return placeholder
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

  const showClear = clearable && !!value

  return (
    <div className={cn("flex items-center justify-between rounded-lg border bg-card px-3 py-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handlePreviousDay}
        disabled={disabled || !value}
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
            className={cn(
              "flex-1 justify-center font-medium hover:bg-accent",
              !value && "text-muted-foreground"
            )}
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

      {showClear ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(undefined)}
          disabled={disabled}
          className="h-8 w-8 p-0 hover:bg-accent"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Clear date</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleNextDay}
          disabled={disabled || !value}
          className="h-8 w-8 p-0 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next day</span>
        </Button>
      )}
    </div>
  )
}

