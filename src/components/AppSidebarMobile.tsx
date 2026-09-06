import { UserDropdownMenu } from '@/components/UserDropdownMenu'
import { ChartCandlestick, ChartNoAxesCombined, Logs, PiggyBank } from "lucide-react"
import { MenuItem } from './MenuItem'
import { NewTransactionTrigger } from "./transactions/NewTransactionTrigger"

export function AppSidebarMobile() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      {/* gap-1 and a narrower inset: a sixth cell only clears the 320px screens
          once the gaps between them stop costing as much as a cell. */}
      <div className='flex items-center justify-between gap-1 px-2 pt-2 pb-[calc(max(theme(spacing.2),env(safe-area-inset-bottom)))]'>
        <MenuItem to="/dashboard" className="flex-1 px-1">
          <ChartNoAxesCombined className="h-6 w-6" />
          <span className="text-[10px]">Overview</span>
        </MenuItem>

        <MenuItem to="/transactions" className="flex-1 px-1">
          <Logs className="h-6 w-6" />
          <span className="text-[10px]">Log</span>
        </MenuItem>

        <div className="flex flex-1 items-center justify-center">
          <NewTransactionTrigger />
        </div>

        <MenuItem to="/investments" className="flex-1 px-1">
          <ChartCandlestick className="h-6 w-6" />
          <span className="text-[10px]">Invest</span>
        </MenuItem>

        <MenuItem to="/savings" className="flex-1 px-1">
          <PiggyBank className="h-6 w-6" />
          <span className="text-[10px]">Savings</span>
        </MenuItem>

        <div className="flex flex-1 flex-col items-center justify-center px-1 py-2 gap-1">
          <UserDropdownMenu />
          <span className="text-[10px]">Me</span>
        </div>
      </div>
    </div>
  )
}
