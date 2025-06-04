import { useState, useEffect } from 'react'
import { useDatabase } from '@/contexts/DatabaseContext'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export function useLiveWallets() {
  const { walletService, db, isInitializing } = useDatabase()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!walletService || !db || isInitializing) return

    let changes: PouchDB.Core.Changes<Wallet> | null = null

    const loadWallets = async () => {
      try {
        const walletList = await walletService.getAllWallets()
        setWallets(walletList)
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to load wallets:', error)
        setIsLoading(false)
      }
    }

    // Initial load
    loadWallets()

    // Listen for changes
    changes = db.wallets.changes({
      since: 'now',
      live: true,
      include_docs: true
    }).on('change', () => {
      // Reload wallets when any change occurs
      loadWallets()
    }).on('error', (err) => {
      console.error('Changes feed error:', err)
    })

    return () => {
      // Cleanup listener
      if (changes) {
        changes.cancel()
      }
    }
  }, [walletService, db, isInitializing])

  return { wallets, isLoading }
}
