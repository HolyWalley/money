import { describe, it, expect } from 'vitest'
import { planPull, type PullPlanInput } from './sync-cursor'

function input(overrides: Partial<PullPlanInput> = {}): PullPlanInput {
  return {
    compiledLastUpdateId: null,
    minUpdateId: null,
    maxUpdateId: null,
    hasCompiledState: false,
    ...overrides,
  }
}

describe('planPull', () => {
  it('returns the compiled state when there is no cursor', () => {
    expect(planPull(input({
      compiledLastUpdateId: 42,
      minUpdateId: 1,
      maxUpdateId: 42,
      hasCompiledState: true,
    }))).toEqual({ mode: 'compiled' })
  })

  it('returns everything when there is no cursor and no compiled state', () => {
    expect(planPull(input({
      minUpdateId: 1,
      maxUpdateId: 7,
    }))).toEqual({ mode: 'all' })
  })

  it('returns a delta by id for a contiguous cursor', () => {
    expect(planPull(input({
      sinceId: 10,
      compiledLastUpdateId: 20,
      minUpdateId: 11,
      maxUpdateId: 20,
      hasCompiledState: true,
    }))).toEqual({ mode: 'delta-by-id', sinceId: 10 })
  })

  it("returns a delta by id when the client's own last row is still present", () => {
    expect(planPull(input({
      sinceId: 10,
      compiledLastUpdateId: 20,
      minUpdateId: 10,
      maxUpdateId: 20,
      hasCompiledState: true,
    }))).toEqual({ mode: 'delta-by-id', sinceId: 10 })
  })

  it('falls back to the compiled state after a cleanup wiped the table', () => {
    expect(planPull(input({
      sinceId: 10,
      compiledLastUpdateId: 20,
      minUpdateId: null,
      maxUpdateId: null,
      hasCompiledState: true,
    }))).toEqual({ mode: 'compiled' })
  })

  it('does not re-send the full state to an up-to-date device after a cleanup', () => {
    expect(planPull(input({
      sinceId: 20,
      compiledLastUpdateId: 20,
      minUpdateId: null,
      maxUpdateId: null,
      hasCompiledState: true,
    }))).toEqual({ mode: 'delta-by-id', sinceId: 20 })
  })

  it('falls back to the compiled state after a partial prune', () => {
    expect(planPull(input({
      sinceId: 10,
      compiledLastUpdateId: 40,
      minUpdateId: 30,
      maxUpdateId: 40,
      hasCompiledState: true,
    }))).toEqual({ mode: 'compiled' })
  })

  it('returns a delta by time for a legacy client', () => {
    expect(planPull(input({
      since: 1735000000000,
      compiledLastUpdateId: 20,
      minUpdateId: 1,
      maxUpdateId: 20,
      hasCompiledState: true,
    }))).toEqual({ mode: 'delta-by-time', since: 1735000000000 })
  })

  it('prefers sinceId when both cursors are present', () => {
    expect(planPull(input({
      sinceId: 10,
      since: 1735000000000,
      compiledLastUpdateId: 20,
      minUpdateId: 11,
      maxUpdateId: 20,
      hasCompiledState: true,
    }))).toEqual({ mode: 'delta-by-id', sinceId: 10 })
  })

  it('treats sinceId 0 as a real cursor, not as absent', () => {
    expect(planPull(input({
      sinceId: 0,
      compiledLastUpdateId: 20,
      minUpdateId: 1,
      maxUpdateId: 20,
      hasCompiledState: true,
    }))).toEqual({ mode: 'delta-by-id', sinceId: 0 })
  })

  it('never returns compiled when no compiled state exists', () => {
    expect(planPull(input({
      sinceId: 10,
      compiledLastUpdateId: null,
      minUpdateId: null,
      maxUpdateId: null,
      hasCompiledState: false,
    }))).toEqual({ mode: 'delta-by-id', sinceId: 10 })
  })
})
