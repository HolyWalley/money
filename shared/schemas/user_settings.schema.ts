import { z } from 'zod';

// TODO: In the future we might define more complete list
export const currencies = ['USD', 'EUR', 'PLN'] as const;

const CurrencyEnum = z.enum(currencies);

export type Currency = z.infer<typeof CurrencyEnum>;

export const UserSettingsSchema = z.object({
  defaultCurrency: CurrencyEnum,
})

export type UserSettings = z.infer<typeof UserSettingsSchema>;
