import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formDefaults, resolveWalletDefaults } from './form-defaults'
import type { Wallet } from '../../shared/schemas/wallet.schema'

const wallets = [
  { _id: 'w1', name: 'Cash', currency: 'USD' },
  { _id: 'w2', name: 'Revolut', currency: 'EUR' },
  { _id: 'w3', name: 'Savings', currency: 'PLN' },
] as Wallet[]

describe('formDefaults', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has no opinion before anything is saved', () => {
    expect(formDefaults.loadWallet('expense')).toBeNull()
    expect(formDefaults.loadDate()).toBeNull()
    expect(formDefaults.loadSaveMode()).toBe('save')
  })

  it('keeps a wallet per transaction type', () => {
    formDefaults.saveWallet('expense', { walletId: 'w1' })
    formDefaults.saveWallet('income', { walletId: 'w2' })

    expect(formDefaults.loadWallet('expense')).toEqual({ walletId: 'w1' })
    expect(formDefaults.loadWallet('income')).toEqual({ walletId: 'w2' })
    expect(formDefaults.loadWallet('transfer')).toBeNull()
  })

  it('keeps both sides of a transfer', () => {
    formDefaults.saveWallet('transfer', { walletId: 'w1', toWalletId: 'w3' })

    expect(formDefaults.loadWallet('transfer')).toEqual({ walletId: 'w1', toWalletId: 'w3' })
  })

  // Built from local parts on purpose: the cutoff is the local calendar day,
  // so a UTC instant would land on either side of it depending on the machine.
  it('returns a date saved earlier on the same day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0))

    formDefaults.saveDate('2026-08-27T00:00:00.000Z')

    vi.setSystemTime(new Date(2026, 7, 29, 23, 30))
    expect(formDefaults.loadDate()).toBe('2026-08-27T00:00:00.000Z')
  })

  it('drops a date once the day it was chosen on has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 23, 30))

    formDefaults.saveDate('2026-08-27T00:00:00.000Z')

    vi.setSystemTime(new Date(2026, 7, 30, 0, 30))
    expect(formDefaults.loadDate()).toBeNull()
  })

  it('does not remember a date that is simply today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0))

    formDefaults.saveDate(new Date(2026, 7, 29, 10, 0).toISOString())

    vi.setSystemTime(new Date(2026, 7, 29, 15, 0))
    expect(formDefaults.loadDate()).toBeNull()
  })

  it('forgets an earlier date once the entry moves back to today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0))

    formDefaults.saveDate('2026-08-27T00:00:00.000Z')
    expect(formDefaults.loadDate()).toBe('2026-08-27T00:00:00.000Z')

    formDefaults.saveDate(new Date(2026, 7, 29, 11, 0).toISOString())
    expect(formDefaults.loadDate()).toBeNull()
  })

  it('still remembers a past date chosen today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0))

    formDefaults.saveDate(new Date(2026, 7, 27, 0, 0).toISOString())

    expect(formDefaults.loadDate()).toBe(new Date(2026, 7, 27, 0, 0).toISOString())
  })

  it('keeps the chosen save mode', () => {
    formDefaults.saveSaveMode('addAnother')
    expect(formDefaults.loadSaveMode()).toBe('addAnother')

    formDefaults.saveSaveMode('save')
    expect(formDefaults.loadSaveMode()).toBe('save')
  })

  it('saving one kind of default leaves the others alone', () => {
    formDefaults.saveWallet('expense', { walletId: 'w1' })
    formDefaults.saveSaveMode('addAnother')
    formDefaults.saveDate('2026-08-29T00:00:00.000Z')

    expect(formDefaults.loadWallet('expense')).toEqual({ walletId: 'w1' })
    expect(formDefaults.loadSaveMode()).toBe('addAnother')
  })

  it('starts over when the stored version is not the current one', () => {
    localStorage.setItem('money:form-defaults', JSON.stringify({
      wallets: { expense: { walletId: 'w1' } },
      date: null,
      saveMode: 'addAnother',
      version: '0',
    }))

    expect(formDefaults.loadWallet('expense')).toBeNull()
    expect(localStorage.getItem('money:form-defaults')).toBeNull()
  })

  it('survives unreadable storage', () => {
    localStorage.setItem('money:form-defaults', 'not json')

    expect(formDefaults.loadWallet('expense')).toBeNull()
    expect(formDefaults.loadSaveMode()).toBe('save')
  })
})

describe('resolveWalletDefaults', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('falls back to the first wallet with nothing remembered', () => {
    expect(resolveWalletDefaults('expense', wallets, 'PLN')).toEqual({
      walletId: 'w1',
      currency: 'USD',
      toWalletId: undefined,
      toCurrency: undefined,
    })
  })

  it('takes the currency from the remembered wallet', () => {
    formDefaults.saveWallet('expense', { walletId: 'w2' })

    expect(resolveWalletDefaults('expense', wallets, 'PLN')).toMatchObject({
      walletId: 'w2',
      currency: 'EUR',
    })
  })

  it('resolves both sides of a remembered transfer', () => {
    formDefaults.saveWallet('transfer', { walletId: 'w2', toWalletId: 'w3' })

    expect(resolveWalletDefaults('transfer', wallets, 'PLN')).toEqual({
      walletId: 'w2',
      currency: 'EUR',
      toWalletId: 'w3',
      toCurrency: 'PLN',
    })
  })

  it('ignores a remembered wallet that no longer exists', () => {
    formDefaults.saveWallet('expense', { walletId: 'deleted' })

    expect(resolveWalletDefaults('expense', wallets, 'PLN')).toMatchObject({
      walletId: 'w1',
      currency: 'USD',
    })
  })

  it('never sends a transfer to the wallet it comes from', () => {
    formDefaults.saveWallet('transfer', { walletId: 'w2', toWalletId: 'w2' })

    expect(resolveWalletDefaults('transfer', wallets, 'PLN')).toMatchObject({
      walletId: 'w2',
      toWalletId: undefined,
    })
  })

  it('leaves the second wallet out of anything but a transfer', () => {
    formDefaults.saveWallet('expense', { walletId: 'w1', toWalletId: 'w3' })

    expect(resolveWalletDefaults('expense', wallets, 'PLN')).toMatchObject({
      toWalletId: undefined,
    })
  })

  it('reports the fallback currency when there are no wallets at all', () => {
    expect(resolveWalletDefaults('expense', [], 'PLN')).toMatchObject({
      walletId: '',
      currency: 'PLN',
    })
  })
})
