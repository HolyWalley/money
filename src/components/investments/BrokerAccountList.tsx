import { useState } from 'react'
import { ChevronDown, ChevronRight, Landmark, MoreHorizontal, Pencil, Plus, Trash, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { BrokerAccountDialog } from './BrokerAccountDialog'
import { brokerLabel } from './BrokerAccountForm'
import { useLiveBrokerAccounts } from '@/hooks/useLiveBrokerAccounts'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { investmentService } from '@/services/investmentService'
import { formatWalletName, UNKNOWN_WALLET_NAME } from '@/lib/wallet-utils'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'
import type { Wallet as WalletType } from '../../../shared/schemas/wallet.schema'

export interface BrokerAccountListProps {
  /**
   * Starts a statement import into one particular account, for the rare file
   * whose broker cannot pick the account by itself. The ordinary way in is the
   * portfolio's own import button, which reads the broker off the file.
   */
  onImport: (account: BrokerAccount) => void
}

/** The count is null when it could not be read; the warning then stays unquantified. */
interface DeleteTarget {
  account: BrokerAccount
  tradeCount: number | null
}

function cashWalletLabel(account: BrokerAccount, wallets: WalletType[]): string {
  if (!account.cashWalletId) return 'No cash wallet linked'

  const wallet = wallets.find(candidate => candidate._id === account.cashWalletId)
  return wallet ? formatWalletName(wallet) : UNKNOWN_WALLET_NAME
}

function deleteDescription({ account, tradeCount }: DeleteTarget): string {
  const kept = 'The instruments they refer to are kept, since another account can hold the same ones.'

  if (tradeCount === null) {
    return `Deleting "${account.name}" also deletes every trade imported into it. ${kept} This cannot be undone.`
  }

  if (tradeCount === 0) {
    return `"${account.name}" has no imported trades. This cannot be undone.`
  }

  return `Deleting "${account.name}" also deletes its ${tradeCount} imported trade${tradeCount === 1 ? '' : 's'}. ${kept} This cannot be undone.`
}

export function BrokerAccountList({ onImport }: BrokerAccountListProps) {
  const { brokerAccounts, isLoading } = useLiveBrokerAccounts()
  const { wallets } = useLiveWallets()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<BrokerAccount | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const openCreate = () => {
    setSelectedAccount(null)
    setIsDialogOpen(true)
  }

  const openEdit = (account: BrokerAccount) => {
    setSelectedAccount(account)
    setIsDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) setSelectedAccount(null)
  }

  // The count is only there to warn, so a failure to read it opens the same
  // confirmation with a vaguer warning rather than blocking the delete.
  const requestDelete = async (account: BrokerAccount) => {
    try {
      const tradeCount = await investmentService.getBrokerAccountTradeCount(account._id)
      setDeleteTarget({ account, tradeCount })
    } catch (error) {
      console.error('Failed to count trades of broker account:', error)
      setDeleteTarget({ account, tradeCount: null })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await investmentService.deleteBrokerAccount(deleteTarget.account._id)
    } catch (error) {
      console.error('Failed to delete broker account:', error)
    }
  }

  if (isLoading) return null

  return (
    <section>
      {brokerAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
          <Landmark className="mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-2 text-base font-semibold">No broker accounts yet</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Add the account you hold your investments in, then import its statement to see your positions
          </p>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Account
          </Button>
        </div>
      ) : (
        // Folded away by default: an account is set up once and then only
        // corrected, so it earns none of the room the holdings need.
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg border px-4 py-2 text-sm transition-colors">
            <span>
              Broker accounts{' '}
              <span className="text-muted-foreground">({brokerAccounts.length})</span>
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <div className="divide-y rounded-lg border">
              {brokerAccounts.map((account) => (
                <div key={account._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span>{brokerLabel(account.broker)}</span>
                      {/* Not hidden from assistive tech: hiding it runs the two
                          labels together into one unreadable word. */}
                      <span> · </span>
                      <span>{cashWalletLabel(account, wallets)}</span>
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">{`Open ${account.name} menu`}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onImport(account)}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import statement
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(account)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => requestDelete(account)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}

      <BrokerAccountDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        account={selectedAccount}
      />

      {deleteTarget && (
        <ConfirmationDialog
          open
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete broker account"
          description={deleteDescription(deleteTarget)}
          confirmText={deleteTarget.tradeCount === 0 ? 'Delete account' : 'Delete account & trades'}
          onConfirm={handleDelete}
          variant="destructive"
        />
      )}
    </section>
  )
}
