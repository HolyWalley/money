import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { MainApp } from '@/components/MainApp'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="finance-tracker-theme">
      <AuthProvider>
        <ProtectedRoute>
          <MainApp />
        </ProtectedRoute>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App