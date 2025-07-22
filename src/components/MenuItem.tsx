import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"

export function MenuItem({ to, children, className }: { to: string, children: React.ReactNode, className?: string }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={
        cn(
          "flex flex-col w-full items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors gap-1",
          className,
          {
            "bg-muted": isActive,
          }
        )
      }
    >
      {children}
    </Link>
  )
}

