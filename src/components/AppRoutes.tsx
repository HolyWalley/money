import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { MainApp } from '@/components/MainApp'
import { WalletsPage } from '@/components/wallets/WalletsPage'
import { Header } from '@/components/Header'
import { TransactionDrawer } from '@/components/transactions/TransactionDrawer'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

import { useSync } from '@/hooks/useSync'
import { useAppInitialization } from '@/hooks/useAppInitialization'

function getDeviceId(): string {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  useSync(getDeviceId())
  useAppInitialization()
  const [transactionDrawerOpen, setTransactionDrawerOpen] = useState(false)

  // Keyboard shortcut for opening transaction drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault()
        setTransactionDrawerOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      {children}

      {/* Floating Action Button */}
      <Button
        variant="default"
        onClick={() => setTransactionDrawerOpen(true)}
        className="fixed bottom-8 right-8 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all z-40"
        size="icon"
      >
        <Plus className="size-6" />
      </Button>

      {/* Transaction Drawer - z-50 to be above FAB */}
      <TransactionDrawer
        open={transactionDrawerOpen}
        onOpenChange={setTransactionDrawerOpen}
      />
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
                  <Route path="/dashboard" element={<MainApp />} />
                  <Route path="/wallets" element={<WalletsPage />} />
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
