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
  const { payments, dueCount, upcomingCount, totalsByCurrency, isLoading } = useUpcomingPayments(periodStart, periodEnd)

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

  const totalsParts: string[] = []
  totalsByCurrency.forEach((amount, currency) => {
    totalsParts.push(`${amount.toFixed(2)} ${currency}`)
  })

  return (
    <div className="px-4 mb-4 overflow-x-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Recurring Payments</span>
            {totalsParts.length > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground flex-1">{totalsParts.join(', ')}</span>
              </>
            )}
            {totalsParts.length === 0 && <span className="flex-1" />}
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
