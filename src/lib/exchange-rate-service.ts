import { ExchangeRateService } from '../../shared/exchange-rates';
import { FrankfurterExchangeRateProvider } from '../../shared/exchange-rate-provider-frankfurter';
import { IndexedDBExchangeRateCache } from './exchange-rate-cache-indexeddb';

let instance: ExchangeRateService | null = null;

export function getExchangeRateService(): ExchangeRateService {
  if (!instance) {
    instance = new ExchangeRateService(
      new FrankfurterExchangeRateProvider(),
      new IndexedDBExchangeRateCache()
    );
  }
  return instance;
}
