import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AppRoutes } from '@/components/AppRoutes'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="finance-tracker-theme">
      <Router>
        <AppRoutes />
      </Router>
    </ThemeProvider>
  )
}

export default App
