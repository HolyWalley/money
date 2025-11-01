import { useEffect, useState, useMemo } from 'react';
import { getExchangeRateService } from '@/lib/exchange-rate-service';

interface UseExchangeRatesParams {
  baseCurrency: string | undefined;
  targetCurrencies: string[];
  startDate: Date | undefined;
  endDate: Date | undefined;
}

interface UseExchangeRatesResult {
  rates: Map<string, number>;
  isLoading: boolean;
  error: Error | null;
}

export function useExchangeRates({
  baseCurrency,
  targetCurrencies,
  startDate,
  endDate,
}: UseExchangeRatesParams): UseExchangeRatesResult {
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const targetCurrenciesKey = useMemo(
    () => [...targetCurrencies].sort().join(','),
    [targetCurrencies]
  );

  const targetCurrenciesSorted = useMemo(
    () => [...targetCurrencies].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetCurrenciesKey]
  );

  const startDateStr = startDate?.toISOString();
  const endDateStr = endDate?.toISOString();

  useEffect(() => {
    if (!baseCurrency || !startDateStr || !endDateStr || !targetCurrenciesKey) {
      setRates(new Map());
      setIsLoading(false);
      setError(null);
      return;
    }

    const fetchRates = async () => {
      console.log(`Fetching exchange rates: ${baseCurrency} -> [${targetCurrenciesSorted.join(', ')}] from ${startDateStr.split('T')[0]} to ${endDateStr.split('T')[0]}`);
      setIsLoading(true);
      setError(null);

      const service = getExchangeRateService();
      try {
        const fetchedRates = await service.getRates(
          baseCurrency,
          targetCurrenciesSorted,
          startDate!,
          endDate!
        );
        setRates(fetchedRates);
        console.log('Fetched exchange rates:', {
          baseCurrency,
          targetCurrencies: targetCurrenciesSorted,
          dateRange: {
            start: startDateStr,
            end: endDateStr,
          },
          ratesCount: fetchedRates.size,
          rates: Object.fromEntries(fetchedRates),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch exchange rates');
        setError(error);
        console.error('Failed to fetch exchange rates:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCurrency, targetCurrenciesKey, startDateStr, endDateStr]);

  return { rates, isLoading, error };
}
