import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'
import type { Category } from 'shared/schemas/category.schema'
import type { Wallet } from 'shared/schemas/wallet.schema'

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildTransactionsCsv(
  transactions: DecoratedTransaction[],
  categories: Category[],
  wallets: Wallet[],
  baseCurrency: string | undefined,
): string {
  const categoryMap = new Map(categories.map(c => [c._id, c.name]))
  const walletMap = new Map(wallets.map(w => [w._id, w.name]))

  const headers = [
    'Date',
    'Type',
    'Category',
    'Wallet',
    'To Wallet',
    'Note',
    'Amount',
    'Currency',
    ...(baseCurrency ? [`Amount (${baseCurrency})`] : []),
  ]

  const rows = transactions.map(t => [
    new Date(t.date).toLocaleDateString('en-CA'),
    t.transactionType,
    categoryMap.get(t.categoryId) ?? '',
    walletMap.get(t.walletId) ?? '',
    t.toWalletId ? (walletMap.get(t.toWalletId) ?? '') : '',
    t.note ?? '',
    t.amount.toFixed(2),
    t.currency,
    ...(baseCurrency
      ? [t.amountInBaseCurrency !== null ? t.amountInBaseCurrency.toFixed(2) : '']
      : []),
  ])

  return [
    headers.map(escapeCsvField).join(','),
    ...rows.map(row => row.map(escapeCsvField).join(',')),
  ].join('\n')
}

export function exportTransactionsToCsv(
  transactions: DecoratedTransaction[],
  categories: Category[],
  wallets: Wallet[],
  baseCurrency: string | undefined,
) {
  const csv = buildTransactionsCsv(transactions, categories, wallets, baseCurrency)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
