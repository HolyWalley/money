import { NewTransactionTrigger } from "./transactions/NewTransactionTrigger"
import { UserDropdownMenu } from '@/components/UserDropdownMenu'
import { DollarSignIcon, Receipt } from "lucide-react"
import { MenuItem } from './MenuItem'

export function AppSidebarMobile() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex items-center justify-between px-4 py-2">
        <MenuItem to="/dashboard">
          <DollarSignIcon className="h-6 w-6" />
          <span className="text-xs">Dashboard</span>
        </MenuItem>

        <MenuItem to="/transactions">
          <Receipt className="h-6 w-6" />
          <span className="text-xs">Transactions</span>
        </MenuItem>

        <div className="flex items-center justify-center">
          <NewTransactionTrigger />
        </div>

        <div className="w-12"></div>

        <div className="flex flex-col items-center justify-center p-2 gap-1">
          <UserDropdownMenu />
          <span className="text-xs">Account</span>
        </div>
      </div>
    </div>
  )
}

