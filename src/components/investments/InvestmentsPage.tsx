import { useState } from 'react'
import { BrokerAccountList } from './BrokerAccountList'
import { DividendsCard } from './DividendsCard'
import { PortfolioOverview } from './PortfolioOverview'
import { PositionsTable } from './PositionsTable'
import { TransactionsCard } from './TransactionsCard'
import { ImportStatementDrawer } from './ImportStatementDrawer'
import { useLiveBrokerAccounts } from '@/hooks/useLiveBrokerAccounts'
import { usePortfolio } from '@/hooks/usePortfolio'
import { usePortfolioHistory, usePreloadPortfolioHistory } from '@/hooks/usePortfolioHistory'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'

export function InvestmentsPage() {
  // The curve's prices and rates are asked for before the positions are read:
  // read one hook after the other, the curve's reads would not start until the
  // table's had answered, and a cold start would pay them end to end.
  usePreloadPortfolioHistory()
  const portfolio = usePortfolio()
  const history = usePortfolioHistory()
  const brokerAccounts = useLiveBrokerAccounts()
  // Which account the import was started from, where it was started from one at
  // all. The drawer stays mounted while closed so it can animate out with its
  // content still on screen rather than blanking halfway.
  const [importAccount, setImportAccount] = useState<BrokerAccount | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)

  // Without one, the statement's own broker chooses the account.
  const startImport = (account: BrokerAccount | null = null) => {
    setImportAccount(account)
    setIsImportOpen(true)
  }

  const hasNoAccounts = brokerAccounts.length === 0

  return (
    <main className="mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {!hasNoAccounts && (
          <>
            {/* The whole portfolio first - what it is worth and what that has
                earned - and each holding's own row answers a narrower question
                below it. */}
            <PortfolioOverview
              points={history.points}
              unpriced={history.unpriced}
              marketValue={portfolio.summary.marketValue}
              hasHoldings={portfolio.positions.length > 0}
              baseCurrency={history.baseCurrency ?? portfolio.baseCurrency}
              asOf={history.asOf}
              onImport={brokerAccounts.length > 0 ? () => startImport() : undefined}
            />

            <PositionsTable {...portfolio} />

            <DividendsCard
              months={history.dividends.months}
              missingCurrencies={history.dividends.missingCurrencies}
              baseCurrency={history.baseCurrency}
              asOf={history.asOf}
            />

            <TransactionsCard convertOn={history.convertOn} baseCurrency={history.baseCurrency} />
          </>
        )}

        <BrokerAccountList onImport={startImport} />
      </div>

      <ImportStatementDrawer
        accounts={brokerAccounts}
        account={importAccount}
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
      />
    </main>
  )
}
