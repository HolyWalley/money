import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, DollarSign, FolderOpen, Wallet, Moon, Sun, Monitor, Palette, Bug, Repeat } from 'lucide-react'
import { currencies, type Currency } from '../../shared/types/userSettings'
import { CategoriesDialog } from '@/components/categories/CategoriesDialog'
import { RecurringPaymentsModal } from '@/components/recurring/RecurringPaymentsModal'
import { useTheme } from '@/contexts/ThemeContext'
import { DebugModal } from '@/components/DebugModal'

export function UserDropdownMenu() {
  const { user, signout, setUser } = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  
  const showDebug = new URLSearchParams(window.location.search).has('debug')

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
      const response = await apiClient.updateUser({
        settings: { defaultCurrency: newCurrency }
      })

      if (!response.ok) {
        // Revert on failure
        setUser(previousUser)
      } else if (response.data) {
        // Update with server data
        setUser(response.data.user)
      }
    } catch (error) {
      console.error('Failed to update currency:', error)
      // Revert on error
      setUser(previousUser)
    }
  }

  const getInitials = (username?: string) => {
    if (!username) return 'U'
    return username
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-sm">
                {getInitials(user?.username)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
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
          <DropdownMenuItem onClick={() => setRecurringOpen(true)}>
            <Repeat className="mr-2 h-4 w-4" />
            <span>Recurring Payments</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}>
                <DropdownMenuRadioItem value="light">
                  <Sun className="mr-2 h-4 w-4" />
                  <span>Light</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon className="mr-2 h-4 w-4" />
                  <span>Dark</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor className="mr-2 h-4 w-4" />
                  <span>System</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {showDebug && (
            <>
              <DropdownMenuItem onClick={() => setDebugOpen(true)}>
                <Bug className="mr-2 h-4 w-4" />
                <span>Debug</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
      <RecurringPaymentsModal open={recurringOpen} onOpenChange={setRecurringOpen} />
      <DebugModal open={debugOpen} onOpenChange={setDebugOpen} />
    </>
  )
}

