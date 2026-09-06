import { useMemo } from 'react'
import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { Trade } from '../../shared/schemas/trade.schema'

export const tradesStore = createSharedLiveQuery(async () => {
  const dexieTrades = await db.trades.orderBy('date').toArray()
  // Newest first, as every other list in the app shows history
  dexieTrades.reverse()
  // Convert Date objects back to ISO strings for components
  return dexieTrades.map(trade => ({
    ...trade,
    date: trade.date.toISOString(),
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString()
  })) as Trade[]
}, { after: documentReady, name: 'trades' })

export function useLiveTrades(accountId?: string): Trade[] {
  const trades = tradesStore()

  return useMemo(
    () => (accountId ? trades.filter(trade => trade.accountId === accountId) : trades),
    [trades, accountId]
  )
}
