import { useMemo } from 'react'
import { useLiveWallets } from './useLiveWallets'
import { useWalletBalances } from './useWalletBalances'
import { useCurrentRates } from './useCurrentRates'
import { useLiveBrokerAccounts } from './useLiveBrokerAccounts'
import { usePortfolio } from './usePortfolio'
import { summarizeNetWorth, type InvestmentHoldings, type NetWorthSummary } from '@/lib/net-worth'

export interface UseNetWorthResult extends NetWorthSummary {
  baseCurrency: string | undefined
  isLoading: boolean
}

export function useNetWorth(): UseNetWorthResult {
  const { wallets, isLoading: isLoadingWallets } = useLiveWallets()
  const { balances, isLoading: isLoadingBalances } = useWalletBalances()
  const { brokerAccounts, isLoading: isLoadingAccounts } = useLiveBrokerAccounts()
  const { summary: portfolio, isLoading: isLoadingPortfolio } = usePortfolio()

  const currencies = useMemo(() => wallets.map(wallet => wallet.currency), [wallets])
  const { convert, baseCurrency, isLoading: isLoadingRates } = useCurrentRates(currencies)

  const investments = useMemo<InvestmentHoldings | null>(() => {
    // Someone who invests through nobody has no investments to report, and a
    // row reading 0.00 forever is worse than no row: it is the common case.
    if (brokerAccounts.length === 0) return null

    return {
      marketValue: portfolio.marketValue,
      missingCurrencies: portfolio.missingCurrencies,
      // A holding whose price never arrived and one whose share count no row
      // ever gave are the same thing to a total: money that is real, held, and
      // not in the figure below.
      unvalued: portfolio.missingPrices.length + portfolio.unquantified.length,
    }
  }, [brokerAccounts, portfolio])

  const summary = useMemo(
    () => summarizeNetWorth(wallets, balances, convert, investments),
    [wallets, balances, convert, investments]
  )

  return {
    ...summary,
    baseCurrency,
    isLoading:
      isLoadingWallets ||
      isLoadingBalances ||
      isLoadingRates ||
      isLoadingAccounts ||
      isLoadingPortfolio,
  }
}
