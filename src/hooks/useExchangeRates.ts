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
  const [isLoading, setIsLoading] = useState(true);
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
    if (!targetCurrenciesKey) {
      setIsLoading(false);
      return;
    }

    if (!baseCurrency || !startDateStr || !endDateStr) {
      setIsLoading(false);
      return;
    }

    // A superseded run must not write: on a slow link it can resolve after a newer run,
    // and since a provider failure now resolves with the cached subset rather than
    // rejecting, its result is a strictly smaller map that would overwrite a complete
    // one — silently understating every total, with `error` still null.
    let cancelled = false;

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
        if (cancelled) return;
        setRates(fetchedRates);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch exchange rates');
        if (cancelled) return;
        setError(error);
        console.error('Failed to fetch exchange rates:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchRates();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCurrency, targetCurrenciesKey, startDateStr, endDateStr]);

  return { rates, isLoading, error };
}
