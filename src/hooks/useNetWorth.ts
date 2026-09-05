import { useMemo } from 'react'
import { useLiveWallets } from './useLiveWallets'
import { useWalletBalances } from './useWalletBalances'
import { useCurrentRates } from './useCurrentRates'
import { summarizeNetWorth, type NetWorthSummary } from '@/lib/net-worth'

export interface UseNetWorthResult extends NetWorthSummary {
  baseCurrency: string | undefined
  isLoading: boolean
}

export function useNetWorth(): UseNetWorthResult {
  const { wallets, isLoading: isLoadingWallets } = useLiveWallets()
  const { balances, isLoading: isLoadingBalances } = useWalletBalances()

  const currencies = useMemo(() => wallets.map(wallet => wallet.currency), [wallets])
  const { convert, baseCurrency, isLoading: isLoadingRates } = useCurrentRates(currencies)

  const summary = useMemo(
    () => summarizeNetWorth(wallets, balances, convert),
    [wallets, balances, convert]
  )

  return {
    ...summary,
    baseCurrency,
    isLoading: isLoadingWallets || isLoadingBalances || isLoadingRates,
  }
}
