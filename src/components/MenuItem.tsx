import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"

export function MenuItem({ to, children }: { to: string, children: React.ReactNode }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={
        cn(
          "flex flex-col items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors gap-1",
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

