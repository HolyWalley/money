import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { addSavingGoal, updateSavingGoal, savingGoals } from './crdts'
import { db } from './db-dexie'

function goalJson(id: string): Record<string, unknown> {
  const goal = savingGoals.get(id)
  if (!goal) throw new Error(`goal ${id} not found`)
  return goal.toJSON()
}

async function waitForDexieGoal(id: string) {
  for (let i = 0; i < 50; i++) {
    const row = await db.savingGoals.get(id)
    if (row) return row
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`goal ${id} never reached Dexie`)
}

function baseGoal() {
  return {
    walletId: 'w-sav',
    name: 'Travel',
    goalType: 'contribution' as const,
    contributionAmount: 100,
    contributionPeriodType: 'monthly' as const,
    contributionMonthDay: 15,
    allocatedAmount: 0,
    achieved: false,
    order: 0,
  }
}

describe('addSavingGoal', () => {
  it('writes every contribution field into the Y.Map', () => {
    const id = addSavingGoal(baseGoal())

    expect(goalJson(id)).toMatchObject({
      goalType: 'contribution',
      contributionAmount: 100,
      contributionPeriodType: 'monthly',
      contributionMonthDay: 15,
    })
  })

  it('writes the weekly and yearly anchors too', () => {
    const weekly = addSavingGoal({
      ...baseGoal(),
      contributionPeriodType: 'weekly',
      contributionMonthDay: undefined,
      contributionWeekDay: 3,
    })
    const yearly = addSavingGoal({
      ...baseGoal(),
      contributionPeriodType: 'yearly',
      contributionMonthDay: undefined,
      contributionYearDay: 200,
    })

    expect(goalJson(weekly)).toMatchObject({ contributionPeriodType: 'weekly', contributionWeekDay: 3 })
    expect(goalJson(yearly)).toMatchObject({ contributionPeriodType: 'yearly', contributionYearDay: 200 })
  })

  it('keeps a target goal free of contribution fields', () => {
    const id = addSavingGoal({
      walletId: 'w-sav',
      name: 'Laptop',
      goalType: 'target',
      targetAmount: 1000,
      allocatedAmount: 0,
      achieved: false,
      order: 0,
    })

    const json = goalJson(id)
    expect(json.goalType).toBe('target')
    expect(json.targetAmount).toBe(1000)
    expect(json.contributionAmount).toBeUndefined()
    expect(json.contributionPeriodType).toBeUndefined()
  })
})

describe('updateSavingGoal', () => {
  it('persists every contribution field', () => {
    const id = addSavingGoal(baseGoal())

    updateSavingGoal(id, {
      name: 'Travel fund',
      contributionAmount: 250,
      contributionPeriodType: 'monthly',
      contributionMonthDay: 20,
    })

    expect(goalJson(id)).toMatchObject({
      name: 'Travel fund',
      contributionAmount: 250,
      contributionPeriodType: 'monthly',
      contributionMonthDay: 20,
    })
  })

  // Regression: the '!== undefined' whitelist cannot clear a field, so a
  // cadence change used to leave the old anchor behind. The stale anchor then
  // contradicted the new cadence and every later edit of the goal was rejected
  // by the schema, turning Update into a silent no-op forever.
  it('clears the orphaned anchor when the cadence changes', () => {
    const id = addSavingGoal(baseGoal())

    updateSavingGoal(id, { contributionPeriodType: 'weekly', contributionWeekDay: 1 })

    const json = goalJson(id)
    expect(json.contributionPeriodType).toBe('weekly')
    expect(json.contributionWeekDay).toBe(1)
    expect('contributionMonthDay' in json).toBe(false)
  })

  it('clears the orphaned anchor when switching back to the original cadence', () => {
    const id = addSavingGoal(baseGoal())

    updateSavingGoal(id, { contributionPeriodType: 'weekly', contributionWeekDay: 1 })
    updateSavingGoal(id, { contributionPeriodType: 'monthly', contributionMonthDay: 15 })

    const json = goalJson(id)
    expect(json.contributionMonthDay).toBe(15)
    expect('contributionWeekDay' in json).toBe(false)
  })

  it('clears both other anchors when switching to a yearly cadence', () => {
    const id = addSavingGoal({ ...baseGoal(), contributionWeekDay: 2 })

    updateSavingGoal(id, { contributionPeriodType: 'yearly', contributionYearDay: 100 })

    const json = goalJson(id)
    expect(json.contributionYearDay).toBe(100)
    expect('contributionMonthDay' in json).toBe(false)
    expect('contributionWeekDay' in json).toBe(false)
  })

  it('leaves the anchor alone when the cadence is not part of the update', () => {
    const id = addSavingGoal(baseGoal())

    updateSavingGoal(id, { allocatedAmount: 50 })

    expect(goalJson(id)).toMatchObject({ contributionMonthDay: 15, allocatedAmount: 50 })
  })
})

describe('savingGoals Dexie mirror', () => {
  beforeEach(async () => {
    await db.savingGoals.clear()
  })

  // This backfill stands in for a Dexie migration: the whole mirror is re-put
  // on every load, so a goal stored before goalType existed still arrives typed.
  it('defaults a goal with no goalType to target', async () => {
    const id = 'legacy-goal'
    savingGoals.set(id, new Y.Map<unknown>(Object.entries({
      _id: id,
      walletId: 'w-sav',
      name: 'Legacy',
      targetAmount: 500,
      allocatedAmount: 0,
      achieved: false,
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })))

    const row = await waitForDexieGoal(id)
    expect(row.goalType).toBe('target')
  })

  it('keeps an explicit contribution goalType and its cadence', async () => {
    const id = addSavingGoal(baseGoal())

    const row = await waitForDexieGoal(id)
    expect(row.goalType).toBe('contribution')
    expect(row.contributionAmount).toBe(100)
    expect(row.contributionPeriodType).toBe('monthly')
    expect(row.contributionMonthDay).toBe(15)
  })

  it('drops the orphaned anchor from the mirror after a cadence change', async () => {
    const id = addSavingGoal(baseGoal())
    await waitForDexieGoal(id)

    updateSavingGoal(id, { contributionPeriodType: 'weekly', contributionWeekDay: 1 })

    for (let i = 0; i < 50; i++) {
      const row = await db.savingGoals.get(id)
      if (row?.contributionPeriodType === 'weekly') {
        expect(row.contributionMonthDay).toBeUndefined()
        return
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('cadence change never reached Dexie')
  })
})

describe('updateSavingGoal optional fields', () => {
  function datedGoal() {
    return {
      walletId: 'w-sav',
      name: 'Laptop',
      goalType: 'target' as const,
      targetAmount: 1000,
      targetDate: '2026-12-31T00:00:00.000Z',
      allocatedAmount: 0,
      achieved: false,
      order: 0,
    }
  }

  // Regression: the '!== undefined' whitelist could set a deadline but never
  // remove one, so a user who cleared the date found it back on reload.
  it('clears a deadline the user removed', () => {
    const id = addSavingGoal(datedGoal())

    updateSavingGoal(id, { targetDate: undefined })

    expect('targetDate' in goalJson(id)).toBe(false)
  })

  it('leaves the deadline alone when the update never mentions it', () => {
    const id = addSavingGoal(datedGoal())

    updateSavingGoal(id, { name: 'New laptop' })

    expect(goalJson(id)).toMatchObject({
      name: 'New laptop',
      targetDate: '2026-12-31T00:00:00.000Z',
    })
  })

  it('replaces a deadline with a later one', () => {
    const id = addSavingGoal(datedGoal())

    updateSavingGoal(id, { targetDate: '2027-06-30T00:00:00.000Z' })

    expect(goalJson(id).targetDate).toBe('2027-06-30T00:00:00.000Z')
  })

  it('unlinks a goal from the recurring payment that fed it', () => {
    const id = addSavingGoal({ ...datedGoal(), sourceRecurringPaymentId: 'rp-1' })

    updateSavingGoal(id, { sourceRecurringPaymentId: undefined })

    expect('sourceRecurringPaymentId' in goalJson(id)).toBe(false)
  })

  it('drops a cleared deadline from the Dexie mirror too', async () => {
    const id = addSavingGoal(datedGoal())
    await waitForDexieGoal(id)

    updateSavingGoal(id, { targetDate: undefined })

    for (let i = 0; i < 50; i++) {
      const row = await db.savingGoals.get(id)
      if (row && row.targetDate === undefined) return
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('cleared deadline never reached Dexie')
  })
})
