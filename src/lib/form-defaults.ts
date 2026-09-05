import { format, isToday } from 'date-fns'
import type { TransactionType } from '../../shared/schemas/transaction.schema'
import type { Currency } from '../../shared/schemas/user_settings.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

const STORAGE_KEY = 'money:form-defaults'
const STORAGE_VERSION = '1'

export type SaveMode = 'save' | 'addAnother'

export interface WalletDefault {
  walletId: string
  toWalletId?: string
}

interface DateDefault {
  value: string
  savedOn: string
}

export interface StoredFormDefaults {
  wallets: Partial<Record<TransactionType, WalletDefault>>
  date: DateDefault | null
  saveMode: SaveMode
  version: string
}

function emptyDefaults(): StoredFormDefaults {
  return { wallets: {}, date: null, saveMode: 'save', version: STORAGE_VERSION }
}

// Local calendar day, so logging at 23:30 still counts as the same day.
function currentDay(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export class FormDefaultsService {
  private read(): StoredFormDefaults | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return null

      const parsed = JSON.parse(stored) as StoredFormDefaults

      if (parsed.version !== STORAGE_VERSION) {
        console.warn('Form defaults version mismatch, clearing storage')
        this.clear()
        return null
      }

      return parsed
    } catch (error) {
      console.error('Failed to read form defaults:', error)
      return null
    }
  }

  private write(data: StoredFormDefaults): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to write form defaults:', error)
    }
  }

  loadWallet(type: TransactionType): WalletDefault | null {
    return this.read()?.wallets?.[type] ?? null
  }

  saveWallet(type: TransactionType, wallet: WalletDefault): void {
    const data = this.read() ?? emptyDefaults()
    data.wallets = { ...data.wallets, [type]: wallet }
    this.write(data)
  }

  // A date chosen yesterday says nothing about what you mean today, and a
  // silently stale date is the one mistake this cannot let through, so the
  // day it was chosen on is stored with it and checked on the way out.
  loadDate(): string | null {
    const date = this.read()?.date
    if (!date || date.savedOn !== currentDay()) return null
    return date.value
  }

  // Today is never worth remembering: the form already falls back to now, and
  // storing it would freeze every later entry in the day at the clock time of
  // the first one. Clearing rather than skipping matters — a date picked
  // earlier today is still remembered, and moving back to today has to drop it.
  saveDate(value: string): void {
    const data = this.read() ?? emptyDefaults()
    const parsed = new Date(value)
    data.date = isToday(parsed) ? null : { value, savedOn: currentDay() }
    this.write(data)
  }

  loadSaveMode(): SaveMode {
    return this.read()?.saveMode ?? 'save'
  }

  saveSaveMode(saveMode: SaveMode): void {
    const data = this.read() ?? emptyDefaults()
    data.saveMode = saveMode
    this.write(data)
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear form defaults:', error)
    }
  }
}

export const formDefaults = new FormDefaultsService()

export interface ResolvedWalletDefaults {
  walletId: string
  currency: Currency
  toWalletId?: string
  toCurrency?: Currency
}

// Currency is never remembered on its own: it belongs to the wallet, so
// resolving the wallet resolves it. A remembered wallet that no longer exists
// falls back to the first one rather than leaving the field empty.
export function resolveWalletDefaults(
  type: TransactionType,
  wallets: Wallet[],
  fallbackCurrency: Currency,
): ResolvedWalletDefaults {
  const remembered = formDefaults.loadWallet(type)
  const from = wallets.find(wallet => wallet._id === remembered?.walletId) ?? wallets[0]

  const to = type === 'transfer'
    ? wallets.find(wallet => wallet._id === remembered?.toWalletId && wallet._id !== from?._id)
    : undefined

  return {
    walletId: from?._id ?? '',
    currency: from?.currency ?? fallbackCurrency,
    toWalletId: to?._id,
    toCurrency: to?.currency,
  }
}

