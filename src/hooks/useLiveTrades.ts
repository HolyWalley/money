import { db, type DexieTrade } from '@/lib/db-dexie'
import { createKeyedSharedLiveQuery } from '@/lib/shared-live-query'
import type { Trade } from '../../shared/schemas/trade.schema'

const EMPTY_TRADES: Trade[] = []

const ALL_ACCOUNTS = 'all'

const useSharedTrades = createKeyedSharedLiveQuery(async (accountId: string) => {
  let dexieTrades: DexieTrade[]
  if (accountId === ALL_ACCOUNTS) {
    dexieTrades = await db.trades.orderBy('date').toArray()
  } else {
    dexieTrades = await db.trades.where('accountId').equals(accountId).sortBy('date')
  }
  // Newest first, as every other list in the app shows history
  dexieTrades.reverse()
  // Convert Date objects back to ISO strings for components
  return dexieTrades.map(trade => ({
    ...trade,
    date: trade.date.toISOString(),
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString()
  })) as Trade[]
})

export function useLiveTrades(accountId?: string) {
  const trades = useSharedTrades(accountId ?? ALL_ACCOUNTS)

  return {
    trades: trades || EMPTY_TRADES,
    isLoading: trades === undefined
  }
}
