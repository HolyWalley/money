import { NewTransactionTrigger } from "./transactions/NewTransactionTrigger"
import { UserDropdownMenu } from '@/components/UserDropdownMenu'
import { ChartNoAxesCombined, Logs, Wallet } from "lucide-react"
import { MenuItem } from './MenuItem'

export function AppSidebarMobile() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <MenuItem to="/dashboard" className="flex-1">
          <ChartNoAxesCombined className="h-6 w-6" />
          <span className="text-xs">Overview</span>
        </MenuItem>

        <MenuItem to="/transactions" className="flex-1">
          <Logs className="h-6 w-6" />
          <span className="text-xs">Log</span>
        </MenuItem>

        <div className="flex flex-1 items-center justify-center">
          <NewTransactionTrigger />
        </div>

        <MenuItem to="/wallets" className="flex-1">
          <Wallet className="h-6 w-6" />
          <span className="text-xs">Wallets</span>
        </MenuItem>

        <div className="flex flex-1 flex-col items-center justify-center p-2 gap-1">
          <UserDropdownMenu />
          <span className="text-xs">Me</span>
        </div>
      </div>
    </div>
  )
}

