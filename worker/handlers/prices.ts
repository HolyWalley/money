import type { CloudflareEnv } from "../types/cloudflare";
import type { MarketDataProvider, PricesResponse, SymbolPrices } from "../../shared/market-data";
import type { StoredClose, StoredInstrument, SymbolFetchRange } from "../durable-objects/MarketObject";
import { CLOSE_LOOKBACK_DAYS, isSettledBar, refreshableFrom, shiftDateKey, utcDateKey } from "../../shared/market-data";
import { YahooMarketDataProvider } from "../../shared/market-data-provider-yahoo";
import { ResponseUtils } from "../utils/response";

/**
 * The prices are shared, so these handlers deliberately take no user: every
 * caller gets the same public market facts out of the same store, and no part
 * of anybody's holdings is sent to the provider. They still sit behind normal
 * auth, just not behind withPremium.
 */

/** One instance for everyone - see MarketObject. */
const MARKET_OBJECT_NAME = 'global';

/**
 * All three caps exist to bound fan-out: a worker invocation only gets so many
 * subrequests, and one request turns into MAX_FETCHES_PER_SYMBOL provider calls
 * per symbol plus the durable object calls. A client with more holdings pages
 * instead.
 *
 * The day cap is measured over the window actually fetched, which starts
 * CLOSE_LOOKBACK_DAYS before the requested `from` (see seedFrom), and carries
 * those extra days so that asking for a full year is not refused over a seed
 * the caller never asked for.
 */
export const MAX_SYMBOLS_PER_REQUEST = 12;
export const MAX_RANGE_DAYS = 400 + CLOSE_LOOKBACK_DAYS;

/**
 * How many provider calls one symbol may cost.
 *
 * Tracking examined ranges as a list rather than a span - which is what stops a
 * window between two fetches being marked covered without anyone asking - means
 * a plan holds one range per hole, and a store built up from scattered visits
 * has arbitrarily many. Past a couple of holes it is cheaper to ask once for
 * everything between the first and the last: the extra days are days the
 * provider returns anyway, and putCloses refuses to overwrite a settled close,
 * so the wider answer costs bandwidth and nothing else.
 */
export const MAX_FETCHES_PER_SYMBOL = 2;

/** Collapses a symbol's plan to one spanning range once it exceeds the cap. */
export function boundFanOut(plan: SymbolFetchRange[], maxPerSymbol = MAX_FETCHES_PER_SYMBOL): SymbolFetchRange[] {
  const bySymbol = new Map<string, SymbolFetchRange[]>();

  for (const range of plan) {
    const ranges = bySymbol.get(range.symbol);
    if (ranges) ranges.push(range);
    else bySymbol.set(range.symbol, [range]);
  }

  const bounded: SymbolFetchRange[] = [];

  for (const [symbol, ranges] of bySymbol) {
    if (ranges.length <= maxPerSymbol) {
      bounded.push(...ranges);
      continue;
    }
    bounded.push({
      symbol,
      from: ranges.reduce((earliest, range) => (range.from < earliest ? range.from : earliest), ranges[0].from),
      to: ranges.reduce((latest, range) => (range.to > latest ? range.to : latest), ranges[0].to),
    });
  }

  return bounded;
}

const MIN_SEARCH_QUERY_LENGTH = 2;
const MAX_SEARCH_QUERY_LENGTH = 64;

// Tickers, suffixed foreign listings ('FWIA.DE'), indices ('^GSPC'), pairs
// ('BTC-USD'). Anything else is not a symbol we could look up anyway.
const SYMBOL_PATTERN = /^[A-Za-z0-9.^=-]{1,24}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

export type { PricesResponse, SymbolPrices };

/**
 * Where the answer really starts.
 *
 * A period beginning on a Saturday has no close of its own, so valuing its
 * first days means reaching back to Friday - which the client cannot do if the
 * earliest day it is ever sent is the following Monday. Fetching and returning
 * a week of run-up costs one wider provider call and is what makes findClose's
 * forward-fill possible at all; FrankfurterExchangeRateProvider.getRates seeds
 * its own forward-fill exactly this way.
 */
function seedFrom(from: string): string {
  return shiftDateKey(from, -CLOSE_LOOKBACK_DAYS);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function rangeDays(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / MS_PER_DAY) + 1;
}

/**
 * Well-formed is not the same as real: '2025-00-05' parses to nothing, which
 * would slip past the range cap as a NaN width and reach the provider as
 * `period1=NaN`, while '2025-02-30' silently becomes March 2nd and would have
 * us record a coverage span for a day nobody asked about.
 */
function isCalendarDate(dateKey: string): boolean {
  const parsed = parseDateKey(dateKey);
  return !Number.isNaN(parsed.getTime()) && utcDateKey(parsed) === dateKey;
}

function validate(symbols: string[], from: string, to: string): string[] {
  const errors: string[] = [];

  if (symbols.length === 0) {
    errors.push('At least one symbol is required');
  }
  if (symbols.length > MAX_SYMBOLS_PER_REQUEST) {
    errors.push(`At most ${MAX_SYMBOLS_PER_REQUEST} symbols per request`);
  }
  if (symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    errors.push('Invalid symbol');
  }

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || !isCalendarDate(from) || !isCalendarDate(to)) {
    errors.push('from and to must be YYYY-MM-DD dates');
  } else if (from > to) {
    errors.push('from must not be after to');
  } else if (rangeDays(seedFrom(from), to) > MAX_RANGE_DAYS) {
    errors.push(`At most ${MAX_RANGE_DAYS} days per request`);
  }

  return errors;
}

export async function onRequestGet(
  request: Request,
  env: CloudflareEnv,
  provider: MarketDataProvider = new YahooMarketDataProvider()
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const symbols = [
      ...new Set(
        (url.searchParams.get('symbols') ?? '')
          .split(',')
          .map((symbol) => symbol.trim())
          .filter((symbol) => symbol.length > 0)
      ),
    ];
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';

    const errors = validate(symbols, from, to);
    if (errors.length > 0) {
      return ResponseUtils.validationError(errors);
    }

    const market = env.MARKET_OBJECT.get(env.MARKET_OBJECT.idFromName(MARKET_OBJECT_NAME));
    const today = utcDateKey(new Date());
    const start = seedFrom(from);

    const plan = boundFanOut(await market.planFetch(symbols, start, to, today));
    if (plan.length > 0) {
      const fetched = await Promise.all(
        plan.map(async (range) => {
          try {
            return await provider.getDailyCloses(range.symbol, parseDateKey(range.from), parseDateKey(range.to));
          } catch (error) {
            // A provider outage freezes the tip of the graph; it must not empty
            // it. Whatever is already stored still answers this request, and the
            // range stays unexamined so the next request retries it.
            console.error(`[PricesHandler] Provider fetch failed for ${range.symbol}:`, error);
            return null;
          }
        })
      );

      const closes: StoredClose[] = [];
      const discovered = new Map<string, StoredInstrument>();
      const examined: SymbolFetchRange[] = [];

      plan.forEach((range, index) => {
        const daily = fetched[index];
        if (daily === null) {
          return;
        }

        examined.push(range);
        // The newest bar in an answer is the only one that can still be an
        // intraday quote; everything before it is a session another session has
        // already followed. See isSettledBar.
        const latest = daily.reduce((newest, close) => (close.date > newest ? close.date : newest), '');
        for (const close of daily) {
          closes.push({
            symbol: range.symbol,
            date: close.date,
            close: close.close,
            settled: isSettledBar(close.date, latest, today),
          });
          discovered.set(range.symbol, {
            symbol: range.symbol,
            name: '',
            currency: close.currency,
            exchange: '',
          });
        }
      });

      if (closes.length > 0) {
        await market.putCloses(closes, refreshableFrom(today));
        await market.putInstruments([...discovered.values()]);
      }
      if (examined.length > 0) {
        await market.markExamined(examined);
      }
    }

    const [stored, instruments] = await Promise.all([
      market.getCloses(symbols, start, to),
      market.getInstruments(symbols),
    ]);

    const currencyBySymbol = new Map(instruments.map((instrument) => [instrument.symbol, instrument.currency]));
    const response: PricesResponse = {};

    for (const row of stored) {
      const entry = response[row.symbol] ?? { currency: currencyBySymbol.get(row.symbol) ?? '', closes: {} };
      entry.closes[row.date] = row.close;
      response[row.symbol] = entry;
    }

    return ResponseUtils.success(response);
  } catch (error) {
    console.error('[PricesHandler] Prices GET error:', error);
    return ResponseUtils.internalError();
  }
}

export async function onRequestGetSearch(
  request: Request,
  env: CloudflareEnv,
  provider: MarketDataProvider = new YahooMarketDataProvider()
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim();

    if (query.length < MIN_SEARCH_QUERY_LENGTH || query.length > MAX_SEARCH_QUERY_LENGTH) {
      return ResponseUtils.validationError([
        `Query must be between ${MIN_SEARCH_QUERY_LENGTH} and ${MAX_SEARCH_QUERY_LENGTH} characters`,
      ]);
    }

    let results;
    try {
      results = await provider.search(query);
    } catch (error) {
      console.error('[PricesHandler] Provider search failed:', error);
      return ResponseUtils.serviceUnavailable('Symbol search is temporarily unavailable');
    }

    if (results.length > 0) {
      const market = env.MARKET_OBJECT.get(env.MARKET_OBJECT.idFromName(MARKET_OBJECT_NAME));
      await market.putInstruments(
        results.map((result) => ({
          symbol: result.symbol,
          name: result.name,
          currency: result.currency,
          exchange: result.exchange,
        }))
      );
    }

    return ResponseUtils.success({ results });
  } catch (error) {
    console.error('[PricesHandler] Search GET error:', error);
    return ResponseUtils.internalError();
  }
}
