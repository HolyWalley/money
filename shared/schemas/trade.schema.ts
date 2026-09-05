import { z } from 'zod';

export const tradeKindSchema = z.enum(['buy', 'sell', 'dividend', 'fee', 'interest', 'adjustment']);

export const tradeSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('trade'),
  accountId: z.string(),
  // Absent on fees and interest, which are charged to the account rather than
  // to a holding.
  instrumentId: z.string().optional(),
  kind: tradeKindSchema,
  date: z.string(),
  // Fractional to 8 decimal places - Revolut sells fractions of a share.
  quantity: z.number().default(0),
  price: z.number().optional(),
  // The signed cash effect on the broker account, in `currency`: negative for
  // buys and fees, positive for sells, dividends and interest.
  amount: z.number(),
  // Not CurrencyEnum: a trade settles in the instrument's currency, which is
  // not restricted to the three a user can keep wallets in.
  currency: z.string(),
  fee: z.number().default(0),
  // Deterministic dedupe key derived from the source row, so re-importing an
  // overlapping statement updates rows instead of duplicating them.
  externalId: z.string(),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTradeSchema = tradeSchema.pick({
  accountId: true,
  instrumentId: true,
  kind: true,
  date: true,
  quantity: true,
  price: true,
  amount: true,
  currency: true,
  fee: true,
  externalId: true,
  note: true,
});

export const updateTradeSchema = tradeSchema.pick({
  accountId: true,
  instrumentId: true,
  kind: true,
  date: true,
  quantity: true,
  price: true,
  amount: true,
  currency: true,
  fee: true,
  externalId: true,
  note: true,
}).partial();

export type TradeKind = z.infer<typeof tradeKindSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type CreateTrade = z.infer<typeof createTradeSchema>;
export type UpdateTrade = z.infer<typeof updateTradeSchema>;
