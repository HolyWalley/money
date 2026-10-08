import { use, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Copy, Mail } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
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
import { accountWalletKey } from '@/lib/bank-import/types'
import { formatMoney } from '@/lib/format-money'
import { formatWalletName } from '@/lib/wallet-utils'
import {
  bankImportService,
  type BankFetchOutcome,
  type BankImportDecision,
  type BankImportTransfer,
} from '@/services/bankImportService'
import { BANK_NOTIFICATION_DAYS, type InboxNotice } from '../../../shared/bank-notifications'
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
  /** Logged as a transfer into another of the person's wallets rather than an expense. */
  transfer: boolean
  toWalletId?: string
  toAmount?: number
}

/** The category a transfer starts with: the default one, else the first. */
function defaultTransferCategory(categories: Category[]): string | undefined {
  const transfers = categories.filter((category) => category.type === 'transfer')
  return (transfers.find((category) => category.isDefault) ?? transfers[0])?._id
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
        {
          logged: item.matchedTransactionId !== undefined,
          walletId: item.walletId,
          transfer: item.operation.suggestTransfer,
          categoryId: item.operation.suggestTransfer ? defaultTransferCategory(categories) : undefined,
          toWalletId: item.toWalletId,
          toAmount: item.operation.received?.amount,
        },
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
  const setAccountWallet = (key: string, walletId: string | undefined) => {
    setChoices((current) =>
      Object.fromEntries(
        items.map((item) => {
          const choice = current[item.operation.externalId]
          return [item.operation.externalId, accountWalletKey(item.operation) === key ? { ...choice, walletId } : choice]
        })
      )
    )
  }

  const decisions: BankImportDecision[] = []
  for (const item of items) {
    const choice = choices[item.operation.externalId]
    if (choice.logged) {
      decisions.push({ item, action: 'logged' })
      continue
    }
    if (!choice.walletId || !choice.categoryId) continue

    if (!choice.transfer) {
      decisions.push({ item, action: 'import', walletId: choice.walletId, categoryId: choice.categoryId })
      continue
    }
    const transfer = transferOf(choice, item.operation.currency, wallets)
    if (transfer) {
      decisions.push({ item, action: 'import', walletId: choice.walletId, categoryId: choice.categoryId, transfer })
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const summary = await bankImportService.save(decisions, outcome.documents)
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
              onTransferChange={(transfer) =>
                update(item.operation.externalId, {
                  transfer,
                  categoryId: transfer ? defaultTransferCategory(categories) : undefined,
                })
              }
              onWalletChange={(walletId) => setAccountWallet(accountWalletKey(item.operation), walletId)}
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

        {outcome.notices.map((notice) => (
          <InboxNoticeAlert key={notice.messageId} notice={notice} />
        ))}

        {saveError && <p className="text-destructive">{saveError}</p>}

        <InboxAddressPanel initialAddress={outcome.address} initialForwarder={outcome.forwarder} />
      </div>

      <DrawerFooter>
        <Button onClick={handleSave} disabled={isSaving || decisions.length === 0}>
          Save {decisions.length}
        </Button>
      </DrawerFooter>
    </>
  )
}

/** Mail that needs the person rather than the parsers, such as Gmail asking to confirm forwarding. */
function InboxNoticeAlert({ notice }: { notice: InboxNotice }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const handleDismiss = async () => {
    if (await bankImportService.dismissNotice(notice.messageId)) {
      setDismissed(true)
    } else {
      toast('The message could not be dismissed')
    }
  }

  return (
    <Alert>
      <Mail className="h-4 w-4" />
      <AlertTitle>{notice.subject || notice.sender}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-xs">From {notice.sender}</p>
        <p className="whitespace-pre-wrap break-words">{notice.text}</p>
        <Button variant="outline" size="sm" onClick={handleDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** Where the bank should send its notifications, with a way to replace it. */
function InboxAddressPanel({ initialAddress, initialForwarder }: { initialAddress: string | null; initialForwarder: string | null }) {
  const [address, setAddress] = useState(initialAddress)
  const [isCreating, setIsCreating] = useState(false)
  const [forwarder, setForwarder] = useState(initialForwarder ?? '')
  const [savedForwarder, setSavedForwarder] = useState(initialForwarder ?? '')
  const [isSavingForwarder, setIsSavingForwarder] = useState(false)

  const handleSaveForwarder = async () => {
    setIsSavingForwarder(true)
    const outcome = await bankImportService.setForwarder(forwarder.trim() || null)
    setIsSavingForwarder(false)
    if (outcome.ok) {
      setForwarder(outcome.forwarder ?? '')
      setSavedForwarder(outcome.forwarder ?? '')
      toast(outcome.forwarder ? 'Forwarding address saved' : 'Forwarding turned off')
    } else {
      toast(outcome.error)
    }
  }

  const handleCreate = async () => {
    setIsCreating(true)
    const outcome = await bankImportService.createAddress()
    setIsCreating(false)
    if (outcome.ok) {
      setAddress(outcome.address)
    } else {
      toast(outcome.error)
    }
  }

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast('Address copied')
    } catch {
      toast('The address could not be copied')
    }
  }

  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label="Notification address">
      <p className="font-medium">Notification address</p>
      {address ? (
        <>
          <p className="text-xs text-muted-foreground">
            Have your bank send its email notifications here, or forward them from your mailbox.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{address}</code>
            <Button variant="outline" size="icon" aria-label="Copy address" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCreate} disabled={isCreating}>
            Replace address
          </Button>
          <p className="text-xs text-muted-foreground">Replacing it stops the current address at once.</p>
          <label className="block space-y-1 pt-2 text-xs">
            <span className="text-muted-foreground">
              Your own mailbox, if a script forwards notifications from it as attached .eml files
            </span>
            <div className="flex gap-2">
              <Input
                type="email"
                aria-label="Forwarded from"
                placeholder="you@example.com"
                value={forwarder}
                onChange={(event) => setForwarder(event.target.value)}
                disabled={isSavingForwarder}
                className="h-8"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveForwarder}
                disabled={isSavingForwarder || forwarder.trim() === savedForwarder}
              >
                Save
              </Button>
            </div>
          </label>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Create an address for your bank to send its email notifications to.
          </p>
          <Button variant="outline" size="sm" onClick={handleCreate} disabled={isCreating}>
            Create address
          </Button>
        </>
      )}
    </section>
  )
}

/** What a transfer row has settled on, or null while something is still missing. */
function transferOf(choice: Choice, currency: string, wallets: Wallet[]): BankImportTransfer | null {
  const toWallet = wallets.find((wallet) => wallet._id === choice.toWalletId)
  if (!toWallet || toWallet._id === choice.walletId) return null
  if (toWallet.currency === currency) return { toWalletId: toWallet._id, toCurrency: toWallet.currency }
  if (!choice.toAmount || choice.toAmount <= 0) return null
  return { toWalletId: toWallet._id, toCurrency: toWallet.currency, toAmount: choice.toAmount }
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
  onTransferChange: (transfer: boolean) => void
}

function BankImportRow({ item, choice, wallets, categories, matched, disabled, onChange, onWalletChange, onTransferChange }: BankImportRowProps) {
  const { operation } = item
  const sign = operation.direction === 'expense' ? '−' : '+'

  // Base UI renders the raw value in the trigger unless it can map it to a label.
  const walletItems = wallets
    .filter((wallet) => wallet.currency === operation.currency)
    .map((wallet) => ({ value: wallet._id, label: formatWalletName(wallet) }))
  const categoryType = choice.transfer ? 'transfer' : operation.direction
  const categoryItems = categories
    .filter((category) => category.type === categoryType)
    .map((category) => ({ value: category._id, label: category.name }))
  const toWalletItems = wallets
    .filter((wallet) => wallet._id !== choice.walletId)
    .map((wallet) => ({ value: wallet._id, label: formatWalletName(wallet) }))
  const toWallet = wallets.find((wallet) => wallet._id === choice.toWalletId)
  const needsReceivedAmount = choice.transfer && toWallet !== undefined && toWallet.currency !== operation.currency

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {format(new Date(operation.date), 'd MMM, HH:mm')} · {formatBankAccount(operation.account)}
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {sign}{formatMoney(operation.amount)} {operation.currency}
          {operation.received && (
            <span className="text-muted-foreground"> → +{formatMoney(operation.received.amount)} {operation.received.currency}</span>
          )}
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

          {choice.transfer && (
            <Select
              items={toWalletItems}
              value={choice.toWalletId ?? null}
              onValueChange={(value) => onChange({ toWalletId: value ?? undefined })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full min-w-0" aria-label="To wallet">
                <SelectValue className="min-w-0 truncate" placeholder="To wallet" />
              </SelectTrigger>
              <SelectContent>
                {toWalletItems.map((wallet) => (
                  <SelectItem key={wallet.value} value={wallet.value}>
                    {wallet.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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

      {!choice.logged && needsReceivedAmount && (
        <label className="flex items-center gap-2 text-xs">
          <span className="shrink-0">Received</span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            aria-label="Received amount"
            value={choice.toAmount ?? ''}
            onChange={(event) => onChange({ toAmount: event.target.value === '' ? undefined : Number(event.target.value) })}
            disabled={disabled}
            className="h-8"
          />
          <span className="shrink-0 text-muted-foreground">{toWallet?.currency}</span>
        </label>
      )}

      {!choice.logged && (
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={choice.transfer}
            onCheckedChange={(checked) => onTransferChange(checked === true)}
            disabled={disabled}
          />
          Transfer to my wallet
        </label>
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
