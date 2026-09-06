import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { Instrument } from '../../shared/schemas/instrument.schema'

export const instrumentsStore = createSharedLiveQuery(async () => {
  const dexieInstruments = await db.instruments.orderBy('name').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieInstruments.map(instrument => ({
    ...instrument,
    createdAt: instrument.createdAt.toISOString(),
    updatedAt: instrument.updatedAt.toISOString()
  })) as Instrument[]
}, { after: documentReady, name: 'instruments' })

export function useLiveInstruments(): Instrument[] {
  return instrumentsStore()
}
