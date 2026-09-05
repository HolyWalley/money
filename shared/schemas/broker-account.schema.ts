import { z } from 'zod';

export const brokerSchema = z.enum(['degiro', 'revolut', 'other']);

export const brokerAccountSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('brokerAccount'),
  name: z.string().min(1, 'Account name is required').max(50, 'Account name is too long'),
  broker: brokerSchema,
  // An ordinary wallet holding the broker's cash, so deposits and withdrawals
  // stay in the user's own ledger instead of being duplicated by an import.
  cashWalletId: z.string().optional(),
  order: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createBrokerAccountSchema = brokerAccountSchema.pick({
  name: true,
  broker: true,
  cashWalletId: true,
  order: true,
});

export const updateBrokerAccountSchema = brokerAccountSchema.pick({
  name: true,
  broker: true,
  cashWalletId: true,
  order: true,
}).partial();

export type Broker = z.infer<typeof brokerSchema>;
export type BrokerAccount = z.infer<typeof brokerAccountSchema>;
export type CreateBrokerAccount = z.infer<typeof createBrokerAccountSchema>;
export type UpdateBrokerAccount = z.infer<typeof updateBrokerAccountSchema>;
