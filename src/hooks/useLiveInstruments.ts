import { db } from '@/lib/db-dexie'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { Instrument } from '../../shared/schemas/instrument.schema'

const EMPTY_INSTRUMENTS: Instrument[] = []

const useSharedInstruments = createSharedLiveQuery(async () => {
  const dexieInstruments = await db.instruments.orderBy('name').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieInstruments.map(instrument => ({
    ...instrument,
    createdAt: instrument.createdAt.toISOString(),
    updatedAt: instrument.updatedAt.toISOString()
  })) as Instrument[]
})

export function useLiveInstruments() {
  const instruments = useSharedInstruments()

  return {
    instruments: instruments || EMPTY_INSTRUMENTS,
    isLoading: instruments === undefined
  }
}
