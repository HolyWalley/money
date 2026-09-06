import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../lib/db-dexie'
import { ydoc, wallets as yWallets } from '../lib/crdts'
import { walletService, type CreateWalletInput } from './walletService'

function newWallet(name: string, overrides: Partial<CreateWalletInput> = {}): CreateWalletInput {
  return {
    name,
    currency: 'EUR',
    initialBalance: 0,
    isSavings: false,
    ...overrides,
  }
}

async function waitForWallet(id: string) {
  for (let i = 0; i < 50; i++) {
    const row = await db.wallets.get(id)
    if (row) return row
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`wallet ${id} never reached Dexie`)
}

/** Creates wallets one at a time, each after the previous one is queryable. */
async function createInOrder(names: string[]) {
  const created = []
  for (const name of names) {
    const wallet = await walletService.createWallet(newWallet(name))
    await waitForWallet(wallet._id)
    created.push(wallet)
  }
  return created
}

beforeEach(async () => {
  ydoc.transact(() => {
    for (const id of [...yWallets.keys()]) yWallets.delete(id)
  })
  await db.wallets.clear()
  await db.transactions.clear()
})

describe('createWallet', () => {
  // Regression: createWalletSchema defaults `order` to 0, so reading it back
  // off the validated data never found it missing - every wallet was created
  // on order 0, and the list fell back to uuid order.
  it('appends each wallet after the ones already there', async () => {
    const created = await createInOrder(['Cash', 'Bank', 'Savings'])

    expect(created.map(wallet => wallet.order)).toEqual([0, 1, 2])
  })

  it('lists wallets in the order they were created', async () => {
    await createInOrder(['Cash', 'Bank', 'Savings'])

    const stored = await db.wallets.orderBy('order').toArray()

    expect(stored.map(wallet => wallet.name)).toEqual(['Cash', 'Bank', 'Savings'])
  })

  it('honours an order the caller asked for', async () => {
    await createInOrder(['Cash'])

    const pinned = await walletService.createWallet(newWallet('Bank', { order: 7 }))

    expect(pinned.order).toBe(7)
  })

  it('stores what the caller asked for', async () => {
    const wallet = await walletService.createWallet(
      newWallet('Holiday', { currency: 'PLN', initialBalance: 250, isSavings: true })
    )

    const stored = await waitForWallet(wallet._id)

    expect(stored).toMatchObject({
      name: 'Holiday',
      currency: 'PLN',
      initialBalance: 250,
      isSavings: true,
    })
  })

  it('rejects a wallet with no name', async () => {
    await expect(walletService.createWallet(newWallet(''))).rejects.toThrow()
    expect(yWallets.size).toBe(0)
  })
})

describe('getAllWallets', () => {
  it('hands back the wallets in list order', async () => {
    await createInOrder(['Cash', 'Bank'])

    const listed = await walletService.getAllWallets()

    expect(listed.map(wallet => wallet.name)).toEqual(['Cash', 'Bank'])
  })
})

describe('updateWallet', () => {
  it('renames a wallet without disturbing its place in the list', async () => {
    const [cash] = await createInOrder(['Cash', 'Bank'])

    const updated = await walletService.updateWallet(cash._id, { name: 'Wallet' })

    expect(updated.name).toBe('Wallet')
    expect(updated.order).toBe(cash.order)
  })

  it('refuses to update a wallet that is not there', async () => {
    await expect(walletService.updateWallet('missing', { name: 'Nope' })).rejects.toThrow('Wallet not found')
  })
})
