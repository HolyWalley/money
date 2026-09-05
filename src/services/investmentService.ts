import { db } from '../lib/db-dexie'
import {
  addBrokerAccount,
  updateBrokerAccount as updateBrokerAccountCRDT,
  deleteBrokerAccount as deleteBrokerAccountCRDT,
  addInstrument,
  updateInstrument as updateInstrumentCRDT,
  addTrades,
  deleteTrades,
  instruments as yInstruments,
  trades as yTrades,
} from '../lib/crdts'
import type { DexieBrokerAccount, DexieInstrument, DexieTrade } from '../lib/db-dexie'
import type { BrokerAccount, CreateBrokerAccount, UpdateBrokerAccount } from '../../shared/schemas/broker-account.schema'
import { brokerAccountSchema, createBrokerAccountSchema, updateBrokerAccountSchema } from '../../shared/schemas/broker-account.schema'
import type { Instrument, CreateInstrument, UpdateInstrument } from '../../shared/schemas/instrument.schema'
import { instrumentSchema, createInstrumentSchema, updateInstrumentSchema } from '../../shared/schemas/instrument.schema'
import type { Trade, CreateTrade } from '../../shared/schemas/trade.schema'
import { createTradeSchema } from '../../shared/schemas/trade.schema'

/** One statement row ready to be stored; the account it belongs to is the import's own. */
export type ImportTradeRow = Omit<CreateTrade, 'accountId'>

/** `order` is assigned from the end of the list when the caller leaves it out. */
export type CreateBrokerAccountInput = Omit<CreateBrokerAccount, 'order'> & { order?: number }

export interface ImportTradeIssue {
  /** Position in the rows handed over, so the preview can point at the source row. */
  index: number
  externalId?: string
  reason: string
}

export interface ImportTradesSummary {
  inserted: number
  /** Rows this account already holds from an overlapping earlier import. */
  alreadyImported: number
  /** Rows the statement itself repeats verbatim. */
  duplicateWithinFile: number
  /** Rows that could not be read. The rest of the statement is imported anyway. */
  invalid: ImportTradeIssue[]
}

function toBrokerAccount(account: DexieBrokerAccount): BrokerAccount {
  return {
    ...account,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString()
  } as BrokerAccount
}

function toInstrument(instrument: DexieInstrument): Instrument {
  return {
    ...instrument,
    createdAt: instrument.createdAt.toISOString(),
    updatedAt: instrument.updatedAt.toISOString()
  } as Instrument
}

function toTrade(trade: DexieTrade): Trade {
  return {
    ...trade,
    date: trade.date.toISOString(),
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString()
  } as Trade
}

class InvestmentService {
  async getAllBrokerAccounts(): Promise<BrokerAccount[]> {
    try {
      const dexieAccounts = await db.brokerAccounts.orderBy('order').toArray()
      return dexieAccounts.map(toBrokerAccount)
    } catch (error) {
      console.error('Error fetching broker accounts:', error)
      throw error
    }
  }

  async getBrokerAccountById(id: string): Promise<BrokerAccount | null> {
    try {
      const account = await db.brokerAccounts.get(id)
      if (!account) return null
      return toBrokerAccount(account)
    } catch (error) {
      console.error('Error fetching broker account:', error)
      throw error
    }
  }

  async createBrokerAccount(data: CreateBrokerAccountInput): Promise<BrokerAccount> {
    try {
      // The schema defaults `order` to 0, so what the caller left out has to be
      // read before validation fills it in - otherwise every account lands on
      // order 0 and the list falls back to uuid order.
      const order = data.order ?? (await this.getMaxOrder()) + 1
      const validatedData = createBrokerAccountSchema.parse({ ...data, order })

      const account: Omit<BrokerAccount, '_id'> = {
        type: 'brokerAccount',
        ...validatedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const validatedAccount = brokerAccountSchema.omit({ _id: true }).parse(account)

      const id = addBrokerAccount({
        ...validatedAccount
      })

      return {
        _id: id,
        ...validatedAccount
      }
    } catch (error) {
      console.error('Error creating broker account:', error)
      throw error
    }
  }

  async updateBrokerAccount(id: string, updates: UpdateBrokerAccount): Promise<BrokerAccount> {
    try {
      const validatedUpdates = updateBrokerAccountSchema.parse(updates)

      const existingAccount = await db.brokerAccounts.get(id)
      if (!existingAccount) {
        throw new Error('Broker account not found')
      }

      updateBrokerAccountCRDT(id, validatedUpdates)

      return {
        ...toBrokerAccount(existingAccount),
        ...validatedUpdates,
        updatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error updating broker account:', error)
      throw error
    }
  }

  async getBrokerAccountTradeCount(id: string): Promise<number> {
    try {
      return await db.trades.where('accountId').equals(id).count()
    } catch (error) {
      console.error('Error getting broker account trade count:', error)
      throw error
    }
  }

  async deleteBrokerAccount(id: string): Promise<void> {
    try {
      const accountTrades = await db.trades.where('accountId').equals(id).toArray()

      // Instruments outlive the account. They carry no account of their own -
      // the same holding can be bought at two brokers - so deleting them here
      // would take another account's history with them.
      deleteTrades(accountTrades.map(trade => trade._id))

      deleteBrokerAccountCRDT(id)
    } catch (error) {
      console.error('Error deleting broker account:', error)
      throw error
    }
  }

  async getAllInstruments(): Promise<Instrument[]> {
    try {
      const dexieInstruments = await db.instruments.orderBy('name').toArray()
      return dexieInstruments.map(toInstrument)
    } catch (error) {
      console.error('Error fetching instruments:', error)
      throw error
    }
  }

  async getInstrumentById(id: string): Promise<Instrument | null> {
    try {
      const instrument = await db.instruments.get(id)
      if (!instrument) return null
      return toInstrument(instrument)
    } catch (error) {
      console.error('Error fetching instrument:', error)
      throw error
    }
  }

  async findOrCreateInstrument(data: CreateInstrument): Promise<Instrument> {
    try {
      const validatedData = createInstrumentSchema.parse(data)

      const existing = this.findInstrumentInDocument(validatedData.isin, validatedData.ticker)
      if (existing) return existing

      const instrument: Omit<Instrument, '_id'> = {
        type: 'instrument',
        ...validatedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const validatedInstrument = instrumentSchema.omit({ _id: true }).parse(instrument)

      const id = addInstrument({
        ...validatedInstrument
      })

      return {
        _id: id,
        ...validatedInstrument
      }
    } catch (error) {
      console.error('Error finding or creating instrument:', error)
      throw error
    }
  }

  async updateInstrument(id: string, updates: UpdateInstrument): Promise<Instrument> {
    try {
      const validatedUpdates = updateInstrumentSchema.parse(updates)

      const existingInstrument = await db.instruments.get(id)
      if (!existingInstrument) {
        throw new Error('Instrument not found')
      }

      updateInstrumentCRDT(id, validatedUpdates)

      return {
        ...toInstrument(existingInstrument),
        ...validatedUpdates,
        updatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error updating instrument:', error)
      throw error
    }
  }

  async getTradesByAccount(accountId: string): Promise<Trade[]> {
    try {
      const dexieTrades = await db.trades.where('accountId').equals(accountId).sortBy('date')
      return dexieTrades.map(toTrade)
    } catch (error) {
      console.error('Error fetching trades:', error)
      throw error
    }
  }

  async importTrades(accountId: string, rows: ImportTradeRow[]): Promise<ImportTradesSummary> {
    try {
      const alreadyStored = this.externalIdsOfAccount(accountId)
      const seenInFile = new Set<string>()
      const newTrades: Array<Omit<Trade, '_id' | 'createdAt' | 'updatedAt'>> = []
      const invalid: ImportTradeIssue[] = []
      let alreadyImported = 0
      let duplicateWithinFile = 0

      rows.forEach((row, index) => {
        const parsed = createTradeSchema.safeParse({ ...row, accountId })
        if (!parsed.success) {
          // One row the parser could not read must not cost the user the other
          // hundred, so it is reported by position instead of throwing.
          invalid.push({
            index,
            externalId: typeof row.externalId === 'string' ? row.externalId : undefined,
            reason: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          })
          return
        }

        // A re-downloaded statement repeats every row the previous one already
        // had, and a single file can repeat a row verbatim. The two are counted
        // apart: only the first means "you have imported this before".
        const { externalId } = parsed.data
        if (alreadyStored.has(externalId)) {
          alreadyImported++
          return
        }
        if (seenInFile.has(externalId)) {
          duplicateWithinFile++
          return
        }

        seenInFile.add(externalId)
        newTrades.push({ type: 'trade', ...parsed.data })
      })

      addTrades(newTrades)

      return {
        inserted: newTrades.length,
        alreadyImported,
        duplicateWithinFile,
        invalid
      }
    } catch (error) {
      console.error('Error importing trades:', error)
      throw error
    }
  }

  /**
   * ISIN first, then ticker: an ISIN identifies the security itself, while a
   * ticker is only unique within an exchange.
   *
   * Reads the Yjs document rather than the Dexie mirror, which is written
   * asynchronously by observers. An import resolves one instrument per row in
   * a loop, so the instrument created for the previous row has not reached the
   * mirror yet and every row would create its own duplicate.
   */
  private findInstrumentInDocument(isin?: string, ticker?: string): Instrument | null {
    if (isin) {
      for (const entry of yInstruments.values()) {
        if (entry.get('isin') === isin) return entry.toJSON() as Instrument
      }
    }

    if (ticker) {
      for (const entry of yInstruments.values()) {
        if (entry.get('ticker') !== ticker) continue
        // A ticker never overrules a known ISIN: two different securities
        // legitimately share one across exchanges, and merging them would put
        // both holdings on one position.
        const knownIsin = entry.get('isin')
        if (isin && typeof knownIsin === 'string' && knownIsin !== isin) continue
        return entry.toJSON() as Instrument
      }
    }

    return null
  }

  /**
   * The external ids one account already holds.
   *
   * Scoped to the account rather than to the whole document: a broker derives
   * the same ids for two accounts held with it, and importing the same file
   * into the wrong account first is a mistake to be corrected, not a reason to
   * drop the statement everywhere else.
   *
   * Same reasoning as findInstrumentInDocument for reading the document rather
   * than the mirror: a second import started before the mirror caught up with
   * the first would re-insert every row.
   */
  private externalIdsOfAccount(accountId: string): Set<string> {
    const externalIds = new Set<string>()
    for (const entry of yTrades.values()) {
      if (entry.get('accountId') !== accountId) continue
      const externalId = entry.get('externalId')
      if (typeof externalId === 'string') externalIds.add(externalId)
    }
    return externalIds
  }

  private async getMaxOrder(): Promise<number> {
    try {
      const accounts = await db.brokerAccounts.orderBy('order').reverse().limit(1).toArray()
      return accounts.length > 0 ? accounts[0].order : -1
    } catch (error) {
      console.error('Error getting max order:', error)
      return -1
    }
  }
}

export const investmentService = new InvestmentService()
