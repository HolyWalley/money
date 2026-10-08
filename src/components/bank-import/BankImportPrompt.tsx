import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { BankImportDrawer } from './BankImportDrawer'
import { documentReady } from '@/lib/document-ready'
import {
  closeBankImport,
  getBankImportStatus,
  openBankImport,
  setPendingBankOperations,
  subscribeBankImportStatus,
} from '@/lib/bank-import-status'
import { bankImportService } from '@/services/bankImportService'

/** How often an open app looks for new notifications. */
export const BANK_IMPORT_CHECK_INTERVAL_MS = 10 * 60 * 1000

const TOAST_ID = 'bank-import'

async function checkInbox(): Promise<void> {
  // Before the ledger has loaded, every operation would look new.
  await documentReady
  const pending = await bankImportService.countPending()
  if (pending !== null) setPendingBankOperations(pending)
}

/**
 * The one bank import drawer, and the check that says when it has something
 * to show: on start, on returning to the app, on coming back online, and
 * every few minutes while open.
 */
export function BankImportPrompt() {
  const { pending, request } = useSyncExternalStore(subscribeBankImportStatus, getBankImportStatus, getBankImportStatus)
  const announced = useRef(0)
  const isOpen = request !== null

  useEffect(() => {
    if (isOpen) return

    const check = () => {
      if (document.visibilityState === 'visible') void checkInbox()
    }
    check()
    const interval = window.setInterval(check, BANK_IMPORT_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
    }
  }, [isOpen])

  useEffect(() => {
    if (pending === 0 || isOpen) {
      announced.current = pending
      toast.dismiss(TOAST_ID)
      return
    }
    // Said once per new arrival, not again on every check.
    if (pending <= announced.current) return
    announced.current = pending
    toast(`${pending} new bank ${pending === 1 ? 'operation' : 'operations'}`, {
      description: 'Your bank reported operations that are not in the app yet.',
      id: TOAST_ID,
      duration: Infinity,
      // Bottom-right is the mobile nav bar; see ServiceWorkerUpdatePrompt.
      position: 'top-center',
      closeButton: true,
      action: { label: 'Review', onClick: openBankImport },
    })
  }, [pending, isOpen])

  return <BankImportDrawer request={request} onClose={closeBankImport} />
}
