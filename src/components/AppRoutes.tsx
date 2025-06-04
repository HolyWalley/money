import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { DatabaseProvider } from '@/contexts/DatabaseContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { MainApp } from '@/components/MainApp'
import { WalletsPage } from '@/components/wallets/WalletsPage'
import { Header } from '@/components/Header'

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      {children}
    </div>
  )
}

export function AppRoutes() {
  return (
    <AuthProvider>
      <DatabaseProvider>
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
      </DatabaseProvider>
    </AuthProvider>
  )
}
