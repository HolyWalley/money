import { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Overview } from '@/components/Overview'
import { WalletsPage } from '@/components/wallets/WalletsPage'
import { InvestmentsPage } from '@/components/investments/InvestmentsPage'
import { SavingsPage } from '@/components/savings/SavingsPage'
import { SavingsNotificationListener } from '@/components/savings/SavingsNotificationListener'
import { RecurringGoalLinkSubscriber } from '@/components/recurring/RecurringGoalLinkSubscriber'
import { SyncNotificationListener } from '@/components/sync/SyncNotificationListener'
import { TransactionsPage } from '@/components/transactions/TransactionsPage'
import { AppSidebar } from './AppSidebar'
import { PageErrorBoundary } from './PageErrorBoundary'

import { useSync } from '@/hooks/useSync'
import { useAppInitialization } from '@/hooks/useAppInitialization'
import { useIsMobile } from '@/hooks/use-mobile'

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

function PageLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <div className="flex items-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading...</span>
      </div>
    </div>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const sync = useSync(getDeviceId())
  useAppInitialization()
  const isMobile = useIsMobile()
  const location = useLocation()

  return (
    <div className="bg-background text-foreground flex">
      <AppSidebar />
      {/* pb-safe-20 rather than pb-20: AppSidebarMobile grows itself by the home
          indicator inset, so a flat 5rem leaves the last row under the nav.

          min-w-0 because a flex item's automatic minimum size is its content's,
          so one wide child - a chart measuring itself against a column that is
          growing to fit it - widens this column past the screen and takes the
          whole page with it. */}
      <div
        className={`min-w-0 flex-1 min-h-[calc(100dvh)] pt-safe ${isMobile ? 'pb-safe-20' : 'pl-24'}`}
      >
        {/* One boundary for every page, below the sidebar so the sidebar never
            blanks. Not keyed on the path: a boundary remounted during a
            transition shows its fallback at once. */}
        <PageErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoading />}>{children}</Suspense>
        </PageErrorBoundary>
      </div>
      <SavingsNotificationListener />
      <RecurringGoalLinkSubscriber />
      <SyncNotificationListener status={sync.status} />
    </div>
  )
}

export function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth" element={<AuthLayout />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/dashboard" element={<Overview />} />
                  <Route path="/wallets" element={<WalletsPage />} />
                  <Route path="/investments" element={<InvestmentsPage />} />
                  <Route path="/savings" element={<SavingsPage />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
