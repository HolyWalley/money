import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Repeat } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { UpcomingPaymentCard } from './UpcomingPaymentCard'
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
  const { payments, dueCount, upcomingCount, isLoading } = useUpcomingPayments(periodStart, periodEnd)

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

  return (
    <div className="px-4 mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Recurring Payments</span>
          </div>

          {duePayments.length > 0 && (
            <div>
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
            </div>
          )}

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
    </div>
  )
}
