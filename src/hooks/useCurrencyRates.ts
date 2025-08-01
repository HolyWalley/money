import { smartCurrencyRates, type CurrencyMapEntry } from "@/lib/currencies"
import { useState, useEffect } from "react"
import { getPeriodDates, type TransactionFilters } from "./useLiveTransactions"

export const useCurrencyRates = (filters: TransactionFilters) => {
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [rates, setRates] = useState<CurrencyMapEntry[]>()

  useEffect(() => {
    if (filters.isLoading) {
      return
    }

    const fetchRates = async () => {
      if (!filters.period) {
        return
      }

      const { start, end } = getPeriodDates(filters.period)
      // query for -5/+5 days around the period
      const newRates = await smartCurrencyRates(
        new Date(start.getTime() - 5 * 24 * 60 * 60 * 1000),
        new Date(end.getTime() + 5 * 24 * 60 * 60 * 1000)
      )
      setRates(newRates)
      setIsLoading(false)
    }

    fetchRates()
  }, [filters.filterVersion])

  return { rates, isLoading }
}
