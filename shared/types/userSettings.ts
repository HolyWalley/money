import { type CurrencyCode } from 'currency-codes-ts/dist/types';

export interface UserSettings {
  defaultCurrency: CurrencyCode;
}

export { type Currency, currencies } from '../schemas/user_settings.schema';
