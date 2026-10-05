import { use, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PopupBoundary } from '@/components/PopupBoundary'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { transactionsStore } from '@/hooks/useLiveTransactions'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { formatBankAccount } from '@/lib/bank-import'
import type { ReviewItem } from '@/lib/bank-import/match'
import { formatMoney } from '@/lib/format-money'
import { formatWalletName } from '@/lib/wallet-utils'
import {
  bankImportService,
  type BankFetchOutcome,
  type BankImportDecision,
} from '@/services/bankImportService'
import { BANK_NOTIFICATION_DAYS } from '../../../shared/bank-notifications'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Transaction } from '../../../shared/schemas/transaction.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

export interface BankImportDrawerProps {
  /** The fetch started by whoever opened the drawer; null while it is closed. */
  request: Promise<BankFetchOutcome> | null
  onClose: () => void
}

interface Choice {
  logged: boolean
  walletId?: string
  categoryId?: string
}

export function BankImportDrawer({ request, onClose }: BankImportDrawerProps) {
  return (
    <Drawer open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="[--drawer-inset:0.5rem] [--bleed:0px] rounded-xl">
        <DrawerHeader>
          <DrawerTitle>Bank import</DrawerTitle>
          <DrawerDescription>
            Operations your bank reported in the last {BANK_NOTIFICATION_DAYS} days. Nothing is saved until you confirm.
          </DrawerDescription>
        </DrawerHeader>
        {request && (
          <PopupBoundary>
            <BankImportBody request={request} onClose={onClose} />
          </PopupBoundary>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function BankImportBody({ request, onClose }: { request: Promise<BankFetchOutcome>; onClose: () => void }) {
  const outcome = use(request)
  const transactions = transactionsStore()
  const wallets = useLiveWallets()
  const categories = useLiveCategories()

  // Reviewed once per fetch: rows must not reshuffle under the person editing them.
  const [items] = useState<ReviewItem[]>(() =>
    outcome.ok ? bankImportService.review(outcome.parsed, transactions, wallets) : []
  )
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.operation.externalId,
        { logged: item.matchedTransactionId !== undefined, walletId: item.walletId },
      ])
    )
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (!outcome.ok) {
    return (
      <div className="px-4 pb-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>The bank notifications could not be fetched</AlertTitle>
          <AlertDescription>{outcome.error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const update = (externalId: string, changes: Partial<Choice>) => {
    setChoices((current) => ({ ...current, [externalId]: { ...current[externalId], ...changes } }))
  }

  // One bank account is one wallet, so choosing it on a row chooses it for the account.
  const setAccountWallet = (account: string, walletId: string | undefined) => {
    setChoices((current) =>
      Object.fromEntries(
        items.map((item) => {
          const choice = current[item.operation.externalId]
          return [item.operation.externalId, item.operation.account === account ? { ...choice, walletId } : choice]
        })
      )
    )
  }

  const decisions: BankImportDecision[] = []
  for (const item of items) {
    const choice = choices[item.operation.externalId]
    if (choice.logged) {
      decisions.push({ item, action: 'logged' })
    } else if (choice.walletId && choice.categoryId) {
      decisions.push({ item, action: 'import', walletId: choice.walletId, categoryId: choice.categoryId })
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const summary = await bankImportService.save(decisions)
      toast(`Imported ${summary.imported}, marked ${summary.logged} as already logged`)
      onClose()
    } catch (error) {
      console.error('Failed to save the bank import:', error)
      setSaveError('The import could not be saved')
      setIsSaving(false)
    }
  }

  const { unreadable } = outcome.parsed

  return (
    <>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 text-sm group-data-[swipe-direction=right]/drawer-popup:max-h-[calc(100dvh-14rem)]">
        {items.length === 0 && (
          <p className="text-muted-foreground">Nothing new from your bank.</p>
        )}

        <ul className="space-y-3">
          {items.map((item) => (
            <BankImportRow
              key={item.operation.externalId}
              item={item}
              choice={choices[item.operation.externalId]}
              wallets={wallets}
              categories={categories}
              matched={transactions.find((transaction) => transaction._id === item.matchedTransactionId)}
              disabled={isSaving}
              onChange={(changes) => update(item.operation.externalId, changes)}
              onWalletChange={(walletId) => setAccountWallet(item.operation.account, walletId)}
            />
          ))}
        </ul>

        {unreadable.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {unreadable.length} {unreadable.length === 1 ? 'row' : 'rows'} could not be read
            </AlertTitle>
            <AlertDescription>
              <ul className="space-y-1">
                {unreadable.map((row, index) => (
                  <li key={index}>{row}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {saveError && <p className="text-destructive">{saveError}</p>}
      </div>

      <DrawerFooter>
        <Button onClick={handleSave} disabled={isSaving || decisions.length === 0}>
          Save {decisions.length}
        </Button>
      </DrawerFooter>
    </>
  )
}

interface BankImportRowProps {
  item: ReviewItem
  choice: Choice
  wallets: Wallet[]
  categories: Category[]
  matched?: Transaction
  disabled: boolean
  onChange: (changes: Partial<Choice>) => void
  onWalletChange: (walletId: string | undefined) => void
}

function BankImportRow({ item, choice, wallets, categories, matched, disabled, onChange, onWalletChange }: BankImportRowProps) {
  const { operation } = item
  const sign = operation.direction === 'expense' ? '−' : '+'

  // Base UI renders the raw value in the trigger unless it can map it to a label.
  const walletItems = wallets
    .filter((wallet) => wallet.currency === operation.currency)
    .map((wallet) => ({ value: wallet._id, label: formatWalletName(wallet) }))
  const categoryItems = categories
    .filter((category) => category.type === operation.direction)
    .map((category) => ({ value: category._id, label: category.name }))

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {format(new Date(operation.date), 'd MMM, HH:mm')} · {formatBankAccount(operation.account)}
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {sign}{formatMoney(operation.amount)} {operation.currency}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-medium">{operation.counterparty}</p>
        <p className="truncate text-xs text-muted-foreground">{operation.title}</p>
      </div>

      {!choice.logged && (
        <div className="flex gap-2">
          <Select
            items={walletItems}
            value={choice.walletId ?? null}
            onValueChange={(value) => onWalletChange(value ?? undefined)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full min-w-0" aria-label="Wallet">
              <SelectValue className="min-w-0 truncate" placeholder="Wallet" />
            </SelectTrigger>
            <SelectContent>
              {walletItems.map((wallet) => (
                <SelectItem key={wallet.value} value={wallet.value}>
                  {wallet.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={categoryItems}
            value={choice.categoryId ?? null}
            onValueChange={(value) => onChange({ categoryId: value ?? undefined })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full min-w-0" aria-label="Category">
              <SelectValue className="min-w-0 truncate" placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={choice.logged}
          onCheckedChange={(checked) => onChange({ logged: checked === true })}
          disabled={disabled}
        />
        Already logged
        {matched && (
          <span className="text-muted-foreground">
            — looks like your entry from {format(new Date(matched.date), 'd MMM')}
          </span>
        )}
      </label>
    </li>
  )
}
