import { useTransition } from "react"
import { Link, useLinkClickHandler, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"

export function MenuItem({ to, children, className }: { to: string, children: React.ReactNode, className?: string }) {
  const location = useLocation()
  const isActive = location.pathname === to
  // The router's own handler, so modifier keys and targets keep their meaning.
  const handleLinkClick = useLinkClickHandler<HTMLAnchorElement>(to)
  // The router already navigates in a transition; this one exists so the
  // tapped item can show the page is on its way.
  const [isPending, startTransition] = useTransition()

  // The router's predicate: a modified or non-primary click is the browser's
  // to open elsewhere, and must not flash this tab's item as busy.
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    startTransition(() => handleLinkClick(event))
  }

  return (
    <Link
      to={to}
      onClick={handleClick}
      aria-current={isActive ? 'page' : undefined}
      aria-busy={isPending || undefined}
      className={
        cn(
          "flex flex-col w-full items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors gap-1",
          className,
          {
            "bg-muted": isActive,
            "opacity-60": isPending,
          }
        )
      }
    >
      {children}
    </Link>
  )
}
