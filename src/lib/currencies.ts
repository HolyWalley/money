import type { Currency } from "shared/schemas/user_settings.schema";
import { db } from "./db-dexie"

export type CurrencyMapEntry = {
  ts: number;
  from: Currency;
  to: Currency;
  rate: number | undefined;
}

// TODO: Add -5 days to "from" and +5 days to "to"
export const smartCurrencyRates = async (from: Date, to: Date) => {
  const transactions = await db.transactions.where('date').between(from, to).and(
    transaction => transaction.transactionType === 'transfer' && transaction.currency !== transaction.toCurrency
  ).sortBy('date')

  const tMap = transactions.map(tx => ({
    ts: tx.date.getTime() as number,
    from: tx.currency,
    to: tx.toCurrency,
    rate: tx.toAmount && tx.amount ? tx.toAmount / tx.amount : undefined,
  } as CurrencyMapEntry))

  return tMap
}
