import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LogOut, User } from 'lucide-react'

export function MainApp() {
  const { user, signout } = useAuth()

  const handleSignOut = async () => {
    await signout()
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-foreground">
                Money
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Welcome, {user?.username}</span>
              </div>

              <ThemeToggle />

              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
            <p className="text-muted-foreground">
              Track your expenses and manage your finances
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">No transactions yet</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Budget</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Set up your budget</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Savings Goals</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Create savings goals</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Welcome to your personal finance tracker! Here's what you can do:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Add and categorize transactions</li>
                <li>Set monthly budgets for different categories</li>
                <li>Create and track savings goals</li>
                <li>View detailed reports and analytics</li>
                <li>Export your data for backup</li>
              </ul>
              <div className="pt-4">
                <Button>Add Your First Transaction</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
