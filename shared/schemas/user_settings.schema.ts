import { z } from 'zod';

// TODO: In the future we might define more complete list
const currencies = ['USD', 'EUR', 'PLN'] as const;

const Currency = z.enum(currencies);

export const UserSettingsSchema = z.object({
  defaultCurrency: Currency,
})

export type UserSettings = z.infer<typeof UserSettingsSchema>;
