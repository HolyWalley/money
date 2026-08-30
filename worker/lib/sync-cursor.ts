export type PullPlan =
  | { mode: 'compiled' }
  | { mode: 'delta-by-id'; sinceId: number }
  | { mode: 'delta-by-time'; since: number }
  | { mode: 'all' }

export interface PullPlanInput {
  sinceId?: number
  since?: number
  compiledLastUpdateId: number | null
  minUpdateId: number | null
  maxUpdateId: number | null
  hasCompiledState: boolean
}

export function planPull(input: PullPlanInput): PullPlan {
  const { sinceId, since, compiledLastUpdateId, minUpdateId, hasCompiledState } = input

  if (sinceId === undefined && since === undefined) {
    return hasCompiledState ? { mode: 'compiled' } : { mode: 'all' }
  }

  if (sinceId !== undefined) {
    // cleanupOldUpdates() runs DELETE FROM updates, so a device holding a cursor
    // would otherwise pull an empty set forever and never see anything pushed
    // before the cleanup. Falling back to the compiled state is idempotent for
    // Yjs; compiledIsAhead stops us re-sending it to an up-to-date device.
    const gap = minUpdateId === null || minUpdateId > sinceId + 1
    const compiledIsAhead = compiledLastUpdateId !== null && compiledLastUpdateId > sinceId
    if (gap && compiledIsAhead && hasCompiledState) {
      return { mode: 'compiled' }
    }
    return { mode: 'delta-by-id', sinceId }
  }

  return { mode: 'delta-by-time', since: since as number }
}
