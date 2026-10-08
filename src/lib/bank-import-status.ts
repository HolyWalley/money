import { bankImportService, type BankFetchOutcome } from '@/services/bankImportService'

export interface BankImportStatus {
  /** Operations and notices waiting in the inbox that nothing has dealt with yet. */
  pending: number
  /** The fetch behind the open drawer; null while it is closed. */
  request: Promise<BankFetchOutcome> | null
}

const initial: BankImportStatus = { pending: 0, request: null }
let status = initial
const listeners = new Set<() => void>()

function update(next: Partial<BankImportStatus>): void {
  status = { ...status, ...next }
  for (const listener of listeners) listener()
}

export function subscribeBankImportStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getBankImportStatus(): BankImportStatus {
  return status
}

export function setPendingBankOperations(pending: number): void {
  if (pending !== status.pending) update({ pending })
}

/** Opens the import from anywhere: the avatar menu, or the prompt saying there is something to review. */
export function openBankImport(): void {
  update({ request: bankImportService.fetchOperations() })
}

export function closeBankImport(): void {
  update({ request: null })
}

export function resetBankImportStatus(): void {
  status = initial
  listeners.clear()
}
