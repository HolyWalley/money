import { useState } from 'react'
import { BrokerAccountList } from './BrokerAccountList'
import { PositionsTable } from './PositionsTable'
import { ImportStatementDrawer } from './ImportStatementDrawer'
import { usePortfolio } from '@/hooks/usePortfolio'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'

export function InvestmentsPage() {
  const portfolio = usePortfolio()
  // Kept after the drawer closes, so it can animate out with its content still
  // on screen rather than blanking halfway.
  const [importAccount, setImportAccount] = useState<BrokerAccount | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)

  const startImport = (account: BrokerAccount) => {
    setImportAccount(account)
    setIsImportOpen(true)
  }

  return (
    <main className="mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <BrokerAccountList onImport={startImport} />

        <PositionsTable {...portfolio} />
      </div>

      {importAccount && (
        <ImportStatementDrawer
          account={importAccount}
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
        />
      )}
    </main>
  )
}
