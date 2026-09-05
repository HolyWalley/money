import { z } from 'zod';

export const instrumentKindSchema = z.enum(['stock', 'etf', 'bond', 'other']);

export const instrumentSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('instrument'),
  // DeGiro statements identify a holding by ISIN, Revolut ones only by ticker,
  // so neither can be required and neither alone is a reliable match key.
  isin: z.string().optional(),
  ticker: z.string().optional(),
  // The market-data symbol the price feed is quoted under, e.g. 'FWIA.DE'.
  // Resolved after import, never at parse time.
  symbol: z.string().optional(),
  name: z.string().min(1, 'Instrument name is required'),
  // Not CurrencyEnum: an instrument may be quoted in any currency, not only
  // the three a user can keep wallets in.
  currency: z.string(),
  kind: instrumentKindSchema.default('other'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createInstrumentSchema = instrumentSchema.pick({
  isin: true,
  ticker: true,
  symbol: true,
  name: true,
  currency: true,
  kind: true,
});

export const updateInstrumentSchema = instrumentSchema.pick({
  isin: true,
  ticker: true,
  symbol: true,
  name: true,
  currency: true,
  kind: true,
}).partial();

export type InstrumentKind = z.infer<typeof instrumentKindSchema>;
export type Instrument = z.infer<typeof instrumentSchema>;
export type CreateInstrument = z.infer<typeof createInstrumentSchema>;
export type UpdateInstrument = z.infer<typeof updateInstrumentSchema>;
