import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { DatabaseProvider } from '@/contexts/DatabaseContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { MainApp } from '@/components/MainApp'

export function AppRoutes() {
  return (
    <AuthProvider>
      <DatabaseProvider>
        <Routes>
          <Route path="/auth" element={<AuthLayout />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <MainApp />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </DatabaseProvider>
    </AuthProvider>
  )
}
