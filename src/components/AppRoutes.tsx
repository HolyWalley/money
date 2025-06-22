import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { MainApp } from '@/components/MainApp'
import { WalletsPage } from '@/components/wallets/WalletsPage'
import { Header } from '@/components/Header'

import { useSync } from '@/hooks/useSync'

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
