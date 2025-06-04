import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LogOut, User, DollarSign, FolderOpen, Wallet } from 'lucide-react'
import { currencies, type Currency } from '../../shared/types/userSettings'
import { CategoriesDialog } from '@/components/categories/CategoriesDialog'

export function Header() {
  const { user, signout, setUser } = useAuth()
  const navigate = useNavigate()
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const handleSignOut = async () => {
    await signout()
  }

  const handleCurrencyChange = async (newCurrency: Currency) => {
    if (!user) return
    
    const previousUser = user
    
    // Optimistic update
    setUser({
      ...user,
      settings: {
        ...user.settings,
        defaultCurrency: newCurrency
      }
    })
    
    try {
      const response = await fetch('/api/v1/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          settings: { 
            defaultCurrency: newCurrency 
          } 
        }),
      })

      if (!response.ok) {
        // Revert on failure
        setUser(previousUser)
      } else {
        // Update with server data
        const data = await response.json()
        if (data.success && data.data?.user) {
          setUser(data.data.user)
        }
      }
    } catch (error) {
      console.error('Failed to update currency:', error)
      // Revert on error
      setUser(previousUser)
    }
  }

  return (
    <header className="bg-card shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="text-xl font-semibold hover:text-foreground/80 transition-colors">
              Money
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>{user?.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Select 
                    value={user?.settings?.defaultCurrency as Currency || 'USD'} 
                    onValueChange={handleCurrencyChange}
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/wallets')}>
                  <Wallet className="mr-2 h-4 w-4" />
                  <span>Wallets</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCategoriesOpen(true)}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>Categories</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
    </header>
  )
}
