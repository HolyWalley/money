import { NewTransactionTrigger } from "./transactions/NewTransactionTrigger"
import { UserDropdownMenu } from '@/components/UserDropdownMenu'
import { AppSidebarMobile } from './AppSidebarMobile'
import { useIsMobile } from '@/hooks/use-mobile'
import { DollarSignIcon, Receipt } from "lucide-react"
import { Link } from "react-router-dom"

export function AppSidebar() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <AppSidebarMobile />
  }

  return (
    <div className="fixed left-0 top-0 h-full w-24 bg-background border-r border-border flex flex-col items-center py-4 gap-4">
      {/* Content - Navigation Items */}
      <div className="flex-1 flex flex-col gap-2">
        <Link
          to="/dashboard"
          className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors gap-0.5"
        >
          <DollarSignIcon className="h-5 w-5" />
          <span className="text-[10px]">Dashboard</span>
        </Link>

        <Link
          to="/transactions"
          className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors gap-0.5"
        >
          <Receipt className="h-5 w-5" />
          <span className="text-[10px]">Transactions</span>
        </Link>

        <div className="flex flex-col items-center justify-center p-2 gap-0.5">
          <UserDropdownMenu />
          <span className="text-[10px]">Account</span>
        </div>
      </div>

      {/* Footer - New Transaction */}
      <div className="flex items-center justify-center">
        <NewTransactionTrigger />
      </div>
    </div>
  )
}
