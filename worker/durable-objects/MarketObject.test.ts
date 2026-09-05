// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import type { MarketObject as MarketObjectClass, StoredClose } from './MarketObject'

/**
 * These tests exist because the handler tests run against a hand-written fake
 * of this object, and a fake only ever paraphrases the rules. The conflict
 * clause that keeps a settled close, the coverage bookkeeping and the column
 * migration are the real product here, so they are executed as SQL against a
 * real SQLite - deleting the WHERE from putCloses has to turn something red.
 *
 * The durable object base class only exists inside workerd, so the module is
 * loaded through a Vite server with that one import stubbed. Nothing else about
 * it is replaced: the class, its SQL and its storage calls are the real ones.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

interface FakeStorage {
  sql: { exec: (query: string, ...bindings: unknown[]) => unknown[] }
  get: (key: string | string[]) => Promise<unknown>
  put: (key: string, value: unknown) => Promise<void>
  dispose: () => void
}

function fakeStorage(): FakeStorage {
  const database = new DatabaseSync(':memory:')
  const values = new Map<string, unknown>()

  return {
    sql: {
      exec(query: string, ...bindings: unknown[]): unknown[] {
        return database.prepare(query).all(...(bindings as never[]))
      },
    },
    async get(key: string | string[]) {
      if (Array.isArray(key)) {
        const found = new Map<string, unknown>()
        for (const one of key) {
          if (values.has(one)) found.set(one, values.get(one))
        }
        return found
      }
      return values.get(key)
    },
    async put(key: string, value: unknown) {
      // Durable object storage hands back a copy, never the object that was
      // written, so a caller that mutates what it stored changes nothing.
      values.set(key, structuredClone(value))
    },
    dispose() {
      database.close()
    },
  }
}

let server: ViteDevServer
let MarketObject: typeof MarketObjectClass

function marketOn(storage: FakeStorage): MarketObjectClass {
  return new MarketObject({ storage } as unknown as DurableObjectState, {} as Env)
}

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: REPO_ROOT,
    logLevel: 'silent',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false },
    plugins: [
      {
        name: 'stub-cloudflare-workers',
        resolveId: (id: string) => (id === 'cloudflare:workers' ? '\0cloudflare:workers' : null),
        load: (id: string) =>
          id === '\0cloudflare:workers'
            ? 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env } }'
            : null,
      },
    ],
  })

  const loaded = await server.ssrLoadModule('/worker/durable-objects/MarketObject.ts')
  MarketObject = loaded.MarketObject as typeof MarketObjectClass
}, 30_000)

afterAll(async () => {
  await server?.close()
})

let storage: FakeStorage
let market: MarketObjectClass

beforeEach(() => {
  storage?.dispose()
  storage = fakeStorage()
  market = marketOn(storage)
})

describe('storing closes', () => {
  const TIP = '2025-03-13'

  it('keeps a settled close when the provider hands back a different number', async () => {
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 }], TIP)
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-10', close: 99.9 }], TIP)

    expect(await market.getCloses(['FWIA.DE'], '2025-03-01', '2025-03-14')).toEqual([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1, settled: true },
    ])
  })

  it('replaces a close still inside the refreshable tip', async () => {
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-14', close: 41.4 }], TIP)
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-14', close: 41.9 }], TIP)

    expect(await market.getCloses(['FWIA.DE'], '2025-03-14', '2025-03-14')).toEqual([
      { symbol: 'FWIA.DE', date: '2025-03-14', close: 41.9, settled: true },
    ])
  })

  it('replaces a price that was taken mid-session however far out of the tip it has fallen', async () => {
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 39.5, settled: false }], TIP)

    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 40.2, settled: true }], TIP)

    expect(await market.getCloses(['FWIA.DE'], '2025-03-03', '2025-03-03')).toEqual([
      { symbol: 'FWIA.DE', date: '2025-03-03', close: 40.2, settled: true },
    ])
  })

  it('will not move that day again once it has settled', async () => {
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 39.5, settled: false }], TIP)
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 40.2, settled: true }], TIP)

    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 99.9, settled: true }], TIP)

    expect((await market.getCloses(['FWIA.DE'], '2025-03-03', '2025-03-03'))[0].close).toBe(40.2)
  })

  it('returns only the asked-for symbols and days, oldest first', async () => {
    await market.putCloses(
      [
        { symbol: 'FWIA.DE', date: '2025-03-12', close: 41 },
        { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 },
        { symbol: 'FWIA.DE', date: '2025-03-20', close: 43 },
        { symbol: 'FWIA.DE', date: '2025-03-01', close: 38 },
        { symbol: 'VWCE.DE', date: '2025-03-10', close: 128.4 },
      ],
      TIP
    )

    const rows = await market.getCloses(['FWIA.DE'], '2025-03-10', '2025-03-12')

    expect(rows.map((row) => [row.date, row.close])).toEqual([
      ['2025-03-10', 40.1],
      ['2025-03-12', 41],
    ])
  })

  it('has nothing to say about no symbols', async () => {
    expect(await market.getCloses([], '2025-03-01', '2025-03-14')).toEqual([])
  })
})

describe('the settled column on a store that predates it', () => {
  it('adds the column and treats what was already there as settled', async () => {
    const legacy = fakeStorage()
    legacy.sql.exec(
      `CREATE TABLE closes (
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        close REAL NOT NULL,
        PRIMARY KEY (symbol, date)
      )`
    )
    legacy.sql.exec('INSERT INTO closes (symbol, date, close) VALUES (?, ?, ?)', 'FWIA.DE', '2025-03-10', 40.1)

    const upgraded = marketOn(legacy)
    await upgraded.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-10', close: 99.9 }], '2025-03-13')

    expect(await upgraded.getCloses(['FWIA.DE'], '2025-03-10', '2025-03-10')).toEqual([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1, settled: true },
    ])
    legacy.dispose()
  })

  it('survives being opened again, when the column is already there', async () => {
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 }], '2025-03-13')

    const reopened = marketOn(storage)

    expect(await reopened.getCloses(['FWIA.DE'], '2025-03-10', '2025-03-10')).toHaveLength(1)
  })
})

describe('planning what to fetch', () => {
  const TODAY = '2025-03-14'

  it('asks for everything it has never looked at', async () => {
    expect(await market.planFetch(['FWIA.DE'], '2025-03-01', '2025-03-10', TODAY)).toEqual([
      { symbol: 'FWIA.DE', from: '2025-03-01', to: '2025-03-10' },
    ])
  })

  it('does not ask again for a past range it has examined', async () => {
    await market.markExamined([{ symbol: 'FWIA.DE', from: '2025-03-01', to: '2025-03-10' }])

    expect(await market.planFetch(['FWIA.DE'], '2025-03-03', '2025-03-09', TODAY)).toEqual([])
  })

  it('still asks for the window between two ranges examined out of order', async () => {
    // The failure this object cannot afford: it is shared by every user, so a
    // window wrongly marked covered is a window nobody ever gets.
    await market.markExamined([{ symbol: 'FWIA.DE', from: '2025-03-01', to: '2025-03-14' }])
    await market.markExamined([{ symbol: 'FWIA.DE', from: '2025-01-01', to: '2025-01-31' }])

    expect(await market.planFetch(['FWIA.DE'], '2025-02-01', '2025-02-28', TODAY)).toEqual([
      { symbol: 'FWIA.DE', from: '2025-02-01', to: '2025-02-28' },
    ])
  })

  it('keeps each symbol\'s coverage to itself', async () => {
    await market.markExamined([{ symbol: 'FWIA.DE', from: '2025-03-01', to: '2025-03-10' }])

    expect(await market.planFetch(['FWIA.DE', 'VWCE.DE'], '2025-03-01', '2025-03-10', TODAY)).toEqual([
      { symbol: 'VWCE.DE', from: '2025-03-01', to: '2025-03-10' },
    ])
  })

  it('reads back coverage written in the single-span shape the first version stored', async () => {
    await storage.put('examined:FWIA.DE', { earliest: '2025-03-01', latest: '2025-03-10' })

    expect(await market.planFetch(['FWIA.DE'], '2025-03-03', '2025-03-09', TODAY)).toEqual([])
    expect(await market.planFetch(['FWIA.DE'], '2025-02-20', '2025-03-09', TODAY)).toEqual([
      { symbol: 'FWIA.DE', from: '2025-02-20', to: '2025-02-28' },
    ])
  })

  it('asks again for a day whose price was taken mid-session, long after the tip moved on', async () => {
    await market.markExamined([{ symbol: 'FWIA.DE', from: '2025-03-01', to: '2025-03-10' }])
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 39.5, settled: false }], '2025-03-13')

    expect(await market.planFetch(['FWIA.DE'], '2025-03-01', '2025-03-10', TODAY)).toEqual([
      { symbol: 'FWIA.DE', from: '2025-03-03', to: '2025-03-10' },
    ])
  })

  it('stops asking once that day has settled', async () => {
    await market.markExamined([{ symbol: 'FWIA.DE', from: '2025-03-01', to: '2025-03-10' }])
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 39.5, settled: false }], '2025-03-13')
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-03', close: 40.2, settled: true }], '2025-03-13')

    expect(await market.planFetch(['FWIA.DE'], '2025-03-01', '2025-03-10', TODAY)).toEqual([])
  })

  it('merges what it examines rather than replacing it, and remembers across instances', async () => {
    await market.markExamined([
      { symbol: 'FWIA.DE', from: '2025-01-01', to: '2025-01-31' },
      { symbol: 'FWIA.DE', from: '2025-02-01', to: '2025-02-28' },
    ])

    expect(await storage.get('examined:FWIA.DE')).toEqual([{ from: '2025-01-01', to: '2025-02-28' }])
    expect(await marketOn(storage).planFetch(['FWIA.DE'], '2025-01-05', '2025-02-20', TODAY)).toEqual([])
  })
})

describe('storing instruments', () => {
  it('lets each source fill in only what it knows', async () => {
    await market.putInstruments([{ symbol: 'FWIA.DE', name: 'Franklin FTSE India', currency: '', exchange: 'XETRA' }])
    await market.putInstruments([{ symbol: 'FWIA.DE', name: '', currency: 'EUR', exchange: '' }])

    expect(await market.getInstruments(['FWIA.DE'])).toEqual([
      { symbol: 'FWIA.DE', name: 'Franklin FTSE India', currency: 'EUR', exchange: 'XETRA' },
    ])
  })

  it('has nothing to say about no symbols', async () => {
    expect(await market.getInstruments([])).toEqual([])
  })
})

describe('the closes a plan is built from', () => {
  it('are the ones the SQL stored, not what the caller passed', async () => {
    const rows: StoredClose[] = [{ symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1, settled: false }]
    await market.putCloses(rows, '2025-03-13')

    expect(storage.sql.exec('SELECT symbol, date, close, settled FROM closes')).toEqual([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1, settled: 0 },
    ])
  })
})
