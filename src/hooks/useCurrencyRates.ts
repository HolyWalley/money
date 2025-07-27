import { smartCurrencyRates, type CurrencyMapEntry } from "@/lib/currencies"
import { useState, useEffect } from "react"

export const useCurrencyRates = (from: Date, to: Date) => {
  const [rates, setRates] = useState<CurrencyMapEntry[]>()

  useEffect(() => {
    const fetchRates = async () => {
      const newRates = await smartCurrencyRates(from, to)
      setRates(newRates)
    }

    fetchRates()
  }, [from, to])

  return rates
}
