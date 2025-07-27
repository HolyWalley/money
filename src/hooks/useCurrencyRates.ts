import { smartCurrencyRates, type CurrencyMapEntry } from "@/lib/currencies"
import { useState, useEffect } from "react"
import { getPeriodDates, type TransactionFilters } from "./useLiveTransactions"

export const useCurrencyRates = (filters: TransactionFilters) => {
  const [rates, setRates] = useState<CurrencyMapEntry[]>()

  const filtersString = JSON.stringify(filters)

  useEffect(() => {
    if (filters.isLoading) {
      return
    }

    const fetchRates = async () => {
      if (!filters.period) {
        return
      }

      const { start, end } = getPeriodDates(filters.period)
      const newRates = await smartCurrencyRates(start, end)
      setRates(newRates)
    }

    fetchRates()
  }, [filters.isLoading, filtersString])

  return rates
}
