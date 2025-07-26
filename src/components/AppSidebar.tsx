import { NewTransactionTrigger } from "./transactions/NewTransactionTrigger"
import { UserDropdownMenu } from '@/components/UserDropdownMenu'
import { AppSidebarMobile } from './AppSidebarMobile'
import { useIsMobile } from '@/hooks/use-mobile'
import { ChartNoAxesCombined, Logs, Wallet } from "lucide-react"
import { MenuItem } from './MenuItem'
import { Separator } from "./ui/separator"
import Logo from '@/assets/logo.svg?react'
import { Link } from "react-router-dom"

export function AppSidebar() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <AppSidebarMobile />
  }

  return (
    <div className="fixed left-0 top-0 h-full w-24 bg-background border-r border-border flex flex-col items-center py-4 gap-4">
      {/* Content - Navigation Items */}
      <div className="flex-1 flex flex-col items-center gap-2">
        <Link to="/dashboard">
          <Logo className="h-8 w-8 text-foreground" />
        </Link>
        <Separator />
        <MenuItem to="/dashboard">
          <ChartNoAxesCombined className="h-5 w-5" />
          <span className="text-[10px]">Overview</span>
        </MenuItem>

        <MenuItem to="/transactions">
          <Logs className="h-5 w-5" />
          <span className="text-[10px]">Log</span>
        </MenuItem>

        <MenuItem to="/wallets">
          <Wallet className="h-5 w-5" />
          <span className="text-[10px]">Wallets</span>
        </MenuItem>

        <Separator />

        <div className="flex flex-col items-center justify-center">
          <NewTransactionTrigger />
        </div>
      </div>

      {/* Footer - New Transaction */}
      <div className="flex flex-col items-center justify-center gap-0.5">
        <UserDropdownMenu />
        <span className="text-[10px]">Me</span>
      </div>
    </div>
  )
}
