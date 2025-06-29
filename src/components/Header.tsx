import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { UserDropdownMenu } from '@/components/UserDropdownMenu'

export function Header() {
  const { isPremium } = useAuth()

  return (
    <header className="bg-card shadow-sm border-b">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Link to="/dashboard" className="text-xl font-semibold hover:text-foreground/80 transition-colors">
                Money
              </Link>
              {isPremium && (
                <Badge variant="secondary" className="text-xs">
                  Premium
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <UserDropdownMenu />
          </div>
        </div>
      </div>
    </header>
  )
}
