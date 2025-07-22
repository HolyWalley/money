import { useState, useEffect } from 'react'
import { Wallet, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WalletCard } from './WalletCard'
import { WalletDialog } from './WalletDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { walletService } from '@/services/walletService'
import type { Wallet as WalletType } from '../../../shared/schemas/wallet.schema'

export function WalletList() {
  const { wallets, isLoading } = useLiveWallets()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null)
  const [walletToDelete, setWalletToDelete] = useState<WalletType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [localWallets, setLocalWallets] = useState<WalletType[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Initialize wallet orders on mount
  useEffect(() => {
    walletService.initializeWalletOrders()
  }, [])

  // Keep local wallets in sync with database
  useEffect(() => {
    setLocalWallets(wallets)
  }, [wallets])

  const handleEdit = (wallet: WalletType) => {
    setSelectedWallet(wallet)
    setIsDialogOpen(true)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = localWallets.findIndex(wallet => wallet._id === active.id)
    const newIndex = localWallets.findIndex(wallet => wallet._id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Optimistically update local state
    const reorderedWallets = arrayMove(localWallets, oldIndex, newIndex)
    setLocalWallets(reorderedWallets)

    // Update order values in the database - update ALL wallets with their new sequential order
    try {
      const updates = reorderedWallets.map((wallet, index) => ({
        id: wallet._id,
        order: index
      }))

      // Update all wallets with new sequential order values (0, 1, 2, 3...)
      await Promise.all(
        updates.map(({ id, order }) =>
          walletService.updateWallet(id, { order })
        )
      )
    } catch (error) {
      console.error('Failed to update wallet order:', error)
      // Revert to database state on error
      setLocalWallets(wallets)
    }
  }

  const handleDelete = async () => {
    if (!walletToDelete) return

    setIsDeleting(true)
    try {
      await walletService.deleteWallet(walletToDelete._id)
      setWalletToDelete(null)
    } catch (error) {
      console.error('Failed to delete wallet:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setSelectedWallet(null)
  }

  const displayWallets = localWallets.length > 0 ? localWallets : wallets
  const walletIds = displayWallets.map(wallet => wallet._id)

  if (isLoading) {
    return null
  }

  if (displayWallets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
        <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No wallets yet</h3>
        <p className="text-muted-foreground text-center mb-6 max-w-sm">
          Create your first wallet to start tracking your finances
        </p>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4" />Create Wallet
        </Button>
        <WalletDialog
          open={isDialogOpen}
          onOpenChange={handleDialogClose}
          wallet={selectedWallet}
        />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Wallets</h2>
            <p className="text-muted-foreground">
              Manage your wallets and track balances
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Wallet
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToParentElement]}
        >
          <SortableContext items={walletIds} strategy={rectSortingStrategy}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayWallets.map((wallet) => (
                <WalletCard
                  key={wallet._id}
                  wallet={wallet}
                  onEdit={handleEdit}
                  onDelete={setWalletToDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <WalletDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        wallet={selectedWallet}
      />

      <AlertDialog open={!!walletToDelete} onOpenChange={() => setWalletToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{walletToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
