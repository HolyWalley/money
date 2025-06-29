import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { TransactionTable } from '@/components/transactions/TransactionTable'

export function MainApp() {
  return (
    <main className="mx-auto py-6 px-4 sm:px-6 lg:px-8">
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

          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">View spending insights</p>
            </CardContent>
          </Card>
        </div>

        <TransactionTable />

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
  )
}
