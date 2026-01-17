import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Repeat, Settings } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { UpcomingPaymentCard } from './UpcomingPaymentCard'
import { RecurringPaymentsModal } from './RecurringPaymentsModal'
import { useUpcomingPayments, type UpcomingPayment } from '@/hooks/useUpcomingPayments'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface UpcomingPaymentsSectionProps {
  periodStart: Date
  periodEnd: Date
  categories: Category[]
  wallets: Wallet[]
  onLogPayment: (payment: UpcomingPayment) => void
  onSkipPayment: (payment: UpcomingPayment) => void
}

export function UpcomingPaymentsSection({
  periodStart,
  periodEnd,
  categories,
  wallets,
  onLogPayment,
  onSkipPayment,
}: UpcomingPaymentsSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const { payments, dueCount, upcomingCount, dueTotal, upcomingTotal, baseCurrency, isLoading } = useUpcomingPayments(periodStart, periodEnd)

  const { duePayments, upcomingPayments } = useMemo(() => {
    return {
      duePayments: payments.filter(p => p.status === 'due'),
      upcomingPayments: payments.filter(p => p.status === 'upcoming'),
    }
  }, [payments])

  if (isLoading) {
    return null
  }

  const totalCount = dueCount + upcomingCount

  if (totalCount === 0) {
    return null
  }

  const totalAmount = (dueTotal ?? 0) + (upcomingTotal ?? 0)
  const summaryParts: string[] = []
  if (dueCount > 0) {
    summaryParts.push(`${dueCount} due`)
  }
  if (upcomingCount > 0) {
    summaryParts.push(`${upcomingCount} upcoming`)
  }
  const summary = baseCurrency
    ? `${summaryParts.join(', ')} (${totalAmount.toFixed(2)} ${baseCurrency})`
    : summaryParts.join(', ')

  return (
    <div className="px-4 mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Recurring Payments</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground flex-1">{summary}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setManageOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          {duePayments.map((payment) => (
            <UpcomingPaymentCard
              key={payment.logId}
              payment={payment}
              categories={categories}
              wallets={wallets}
              onLog={onLogPayment}
              onSkip={onSkipPayment}
            />
          ))}

          {upcomingPayments.length > 0 && (
            <>
              <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors border-t">
                <span>{upcomingCount} upcoming</span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                {upcomingPayments.map((payment) => (
                  <UpcomingPaymentCard
                    key={payment.logId}
                    payment={payment}
                    categories={categories}
                    wallets={wallets}
                    onLog={onLogPayment}
                    onSkip={onSkipPayment}
                  />
                ))}
              </CollapsibleContent>
            </>
          )}
        </div>
      </Collapsible>

      <RecurringPaymentsModal
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </div>
  )
}
