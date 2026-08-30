import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AppRoutes } from '@/components/AppRoutes'
import { Toaster } from '@/components/ui/sonner'
import { ServiceWorkerUpdatePrompt } from '@/components/ServiceWorkerUpdatePrompt'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="finance-tracker-theme">
      <Router>
        <AppRoutes />
      </Router>
      <Toaster position="bottom-right" />
      <ServiceWorkerUpdatePrompt />
    </ThemeProvider>
  )
}

export default App
