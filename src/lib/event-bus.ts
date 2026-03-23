import { createNanoEvents } from 'nanoevents'
import type { Transaction } from '../../shared/schemas/transaction.schema'

export interface EventMap {
  'transaction:created': (tx: Transaction) => void
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
