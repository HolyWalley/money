import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils'

interface MoneyInputProps {
  defaultValue?: number;
  overrideValue?: number;
  className?: string;
  onChange?: (value: number) => void;
  disabled?: boolean;
}

// Regexp that allows only gte 0, decimal numbers with either command or dot
const REGEXP_MONEY = /^(0|[1-9]\d*)([.,]\d{0,2})?$/;

export function MoneyInput({ defaultValue, disabled, className, overrideValue, onChange }: MoneyInputProps) {
  const [value, setValue] = useState(defaultValue?.toString() || '');

  const change = (value: number) => {
    if (onChange) {
      onChange(value);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;

    if (newValue === '') {
      setValue(newValue);
      change(0);
      return;
    }

    if (!REGEXP_MONEY.test(newValue)) {
      return;
    }

    newValue = newValue.replace(/,/g, '.');

    setValue(newValue)

    change(parseFloat(newValue || '0'))
  }

  useEffect(() => {
    if (overrideValue === undefined) {
      return
    }

    setValue(overrideValue.toString());
  }, [overrideValue, onChange]);

  return <input
    className={cn(
      'transition-opacity border-0 bg-transparent outline-none text-center appearance-none ',
      value ? 'opacity-100' : 'opacity-30',
      className,
    )}
    type="text"
    value={value}
    placeholder="0"
    disabled={disabled}
    inputMode="decimal"
    onChange={handleChange}
    // Ideally would be using tailwind class e.g. `w-[3ch]`, but it doesn't work with dynamic values
    style={{ width: `${Math.max(1, value.toString().length || 1)}ch` }}
  />
}
