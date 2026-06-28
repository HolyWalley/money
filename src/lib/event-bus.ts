import { createNanoEvents } from 'nanoevents'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

export interface EventMap {
  'transaction:created': (tx: Transaction) => void
  'recurringPayment:created': (rp: RecurringPayment) => void
  'recurringPayment:updated': (payload: { rp: RecurringPayment; prev: RecurringPayment }) => void
  'recurringPayment:replaced': (payload: { prev: RecurringPayment; replacement: RecurringPayment }) => void
  'recurringPayment:logged': (payload: { rp: RecurringPayment; scheduledDate: string }) => void
  'recurringPayment:skipped': (payload: { rp: RecurringPayment; scheduledDate: string }) => void
  'recurringPayment:deactivated': (rp: RecurringPayment) => void
  'recurringPayment:deleted': (rpId: string) => void
}

function createEventBus() {
  const emitter = createNanoEvents<EventMap>()

  return {
    on<K extends keyof EventMap>(event: K, handler: EventMap[K]) {
      return emitter.on(event, handler)
    },
    emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>) {
      emitter.emit(event, ...args)
    },
  }
}

export const eventBus = createEventBus()
