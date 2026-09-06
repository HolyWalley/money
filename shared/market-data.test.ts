import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  CLOSE_LOOKBACK_DAYS,
  FETCH_WINDOW_DAYS,
  createPriceCacheKey,
  fetchWindows,
  findClose,
  isSettledBar,
  mergeRanges,
  planPriceFetch,
  rankCandidatesByTradePrice,
  shiftDateKey,
  utcDateKey,
} from './market-data'
import type { DateRange, InstrumentCandidate } from './market-data'

/** Both ends included, the way every range in this module is measured. */
function rangeDays(from: string, to: string): number {
  const start = new UTCDate(`${from}T00:00:00.000Z`).getTime()
  const end = new UTCDate(`${to}T00:00:00.000Z`).getTime()
  return Math.round((end - start) / 86400000) + 1
}

describe('createPriceCacheKey', () => {
  it('keys a close by symbol and day', () => {
    expect(createPriceCacheKey('FWIA.DE', '2025-03-14')).toBe('FWIA.DE:2025-03-14')
  })
})

describe('utcDateKey / shiftDateKey', () => {
  it('reads the UTC calendar day, not the local one', () => {
    expect(utcDateKey(new UTCDate('2025-03-14T23:30:00Z'))).toBe('2025-03-14')
  })

  it('steps across a month boundary', () => {
    expect(shiftDateKey('2025-03-01', -1)).toBe('2025-02-28')
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('findClose', () => {
  const closes = new Map([
    ['FWIA.DE:2025-03-14', 42.5],
    ['FWIA.DE:2025-03-07', 40],
  ])

  it('returns the close of the day when there is one', () => {
    expect(findClose(closes, 'FWIA.DE', new UTCDate('2025-03-14T00:00:00Z'))).toBe(42.5)
  })

  it('forward-fills a weekend from the last session', () => {
    // 2025-03-15 and 16 are a Saturday and a Sunday: no session, no close.
    expect(findClose(closes, 'FWIA.DE', new UTCDate('2025-03-16T00:00:00Z'))).toBe(42.5)
  })

  it('looks back a full week but no further', () => {
    const sevenDaysOn = new UTCDate('2025-03-21T00:00:00Z')
    const eightDaysOn = new UTCDate('2025-03-22T00:00:00Z')

    expect(findClose(closes, 'FWIA.DE', sevenDaysOn, CLOSE_LOOKBACK_DAYS)).toBe(42.5)
    expect(findClose(closes, 'FWIA.DE', eightDaysOn, CLOSE_LOOKBACK_DAYS)).toBeNull()
  })

  it('never reaches forward to a later session', () => {
    expect(findClose(closes, 'FWIA.DE', new UTCDate('2025-03-06T00:00:00Z'))).toBeNull()
  })

  it('returns null for an unknown symbol rather than zero', () => {
    expect(findClose(closes, 'VWCE.DE', new UTCDate('2025-03-14T00:00:00Z'))).toBeNull()
  })
})

describe('fetchWindows', () => {
  it('leaves a range the server will answer in one go alone', () => {
    expect(fetchWindows('2025-01-01', '2025-03-14')).toEqual([
      { from: '2025-01-01', to: '2025-03-14' },
    ])
  })

  // A chart reaching back years is one call at the client's level and several
  // at the server's, because the endpoint refuses anything past its day cap.
  it('splits a longer history into windows the day cap allows', () => {
    const windows = fetchWindows('2023-01-01', '2025-03-14')

    expect(windows.length).toBeGreaterThan(1)
    expect(windows[0].from).toBe('2023-01-01')
    expect(windows[windows.length - 1].to).toBe('2025-03-14')

    for (const window of windows) {
      expect(rangeDays(window.from, window.to)).toBeLessThanOrEqual(FETCH_WINDOW_DAYS)
    }
  })

  // A day falling in no window at all is a hole nothing would ever fill, and
  // one falling in two is a day fetched twice.
  it('tiles the range without a gap or an overlap', () => {
    const windows = fetchWindows('2023-01-01', '2025-03-14')

    for (let index = 1; index < windows.length; index++) {
      expect(windows[index].from).toBe(shiftDateKey(windows[index - 1].to, 1))
    }
  })

  it('has nothing to ask for when the range ends before it starts', () => {
    expect(fetchWindows('2025-03-14', '2025-03-10')).toEqual([])
  })
})

describe('mergeRanges', () => {
  it('joins overlapping and touching ranges, and sorts them', () => {
    expect(
      mergeRanges([
        { from: '2025-03-01', to: '2025-03-10' },
        { from: '2025-01-01', to: '2025-01-31' },
        { from: '2025-02-01', to: '2025-02-28' },
        { from: '2025-03-05', to: '2025-03-20' },
      ])
    ).toEqual([{ from: '2025-01-01', to: '2025-03-20' }])
  })

  it('keeps ranges with a real day between them apart', () => {
    expect(
      mergeRanges([
        { from: '2025-01-01', to: '2025-01-31' },
        { from: '2025-02-02', to: '2025-02-28' },
      ])
    ).toEqual([
      { from: '2025-01-01', to: '2025-01-31' },
      { from: '2025-02-02', to: '2025-02-28' },
    ])
  })

  it('drops a reversed range rather than swallowing days with it', () => {
    expect(mergeRanges([{ from: '2025-03-10', to: '2025-03-01' }])).toEqual([])
  })
})

describe('isSettledBar', () => {
  it('settles a bar another session in the same answer has followed', () => {
    expect(isSettledBar('2025-03-13', '2025-03-14', '2025-03-14')).toBe(true)
  })

  it('settles a bar dated before the day we asked on', () => {
    expect(isSettledBar('2025-03-13', '2025-03-13', '2025-03-14')).toBe(true)
  })

  it('refuses to settle the newest bar of a day still trading', () => {
    // 18:00 UTC on a Monday: the US session has not closed, so this is an
    // intraday quote wearing Monday's date.
    expect(isSettledBar('2025-03-14', '2025-03-14', '2025-03-14')).toBe(false)
  })
})

describe('planPriceFetch', () => {
  const today = '2025-03-14'

  it('fetches the whole range when nothing is stored', () => {
    expect(planPriceFetch(null, '2025-01-01', '2025-03-14', today)).toEqual([
      { from: '2025-01-01', to: '2025-03-14' },
    ])
  })

  it('does not refetch a past range that is already stored', () => {
    const examined = [{ from: '2025-01-01', to: '2025-03-10' }]

    expect(planPriceFetch(examined, '2025-01-05', '2025-03-01', today)).toEqual([])
  })

  it('treats holes inside an examined range as closed markets, not as gaps', () => {
    // The range covers the request even though most days in it never traded.
    const examined = [{ from: '2025-03-03', to: '2025-03-10' }]

    expect(planPriceFetch(examined, '2025-03-08', '2025-03-09', today)).toEqual([])
  })

  it('still refetches the tip, the only part that is not final yet', () => {
    const examined = [{ from: '2025-01-01', to: '2025-03-14' }]

    // Yesterday too: its close only became final late in yesterday's UTC day,
    // so what we stored for it may be an intraday price.
    expect(planPriceFetch(examined, '2025-03-01', '2025-03-14', today)).toEqual([
      { from: '2025-03-13', to: '2025-03-14' },
    ])
  })

  it('does not widen the tip past the start of the requested range', () => {
    const examined = [{ from: '2025-01-01', to: '2025-03-14' }]

    expect(planPriceFetch(examined, '2025-03-14', '2025-03-14', today)).toEqual([
      { from: '2025-03-14', to: '2025-03-14' },
    ])
  })

  it('backfills only the part before what has been examined', () => {
    const examined = [{ from: '2025-02-01', to: '2025-03-14' }]

    expect(planPriceFetch(examined, '2025-01-01', '2025-02-20', today)).toEqual([
      { from: '2025-01-01', to: '2025-01-31' },
    ])
  })

  it('asks for both ends when the request straddles what has been examined', () => {
    const examined = [{ from: '2025-02-01', to: '2025-03-05' }]

    expect(planPriceFetch(examined, '2025-01-01', '2025-03-14', today)).toEqual([
      { from: '2025-01-01', to: '2025-01-31' },
      { from: '2025-03-06', to: '2025-03-14' },
    ])
  })

  it('never asks for a session that has not happened yet', () => {
    const examined = [{ from: '2025-01-01', to: '2025-03-13' }]

    expect(planPriceFetch(examined, '2025-03-01', '2025-12-31', today)).toEqual([
      { from: '2025-03-13', to: '2025-03-14' },
    ])
  })

  it('returns nothing for a range that lies entirely in the future', () => {
    expect(planPriceFetch(null, '2025-04-01', '2025-04-30', today)).toEqual([])
  })

  it('asks again for the day a price was taken mid-session, however old it is', () => {
    const examined = [{ from: '2025-01-01', to: '2025-03-14' }]

    // Reaching to the end of the request is the point: only a later session
    // proves the unsettled one has finished.
    expect(planPriceFetch(examined, '2025-03-01', '2025-03-10', today, '2025-03-05')).toEqual([
      { from: '2025-03-05', to: '2025-03-10' },
    ])
  })

  it('leaves an unsettled day outside the request alone', () => {
    const examined = [{ from: '2025-01-01', to: '2025-03-14' }]

    expect(planPriceFetch(examined, '2025-03-01', '2025-03-10', today, '2025-02-05')).toEqual([])
  })
})

/**
 * The failure this planner exists to prevent, in the order it actually
 * happened. The store behind it is shared by every user, so a window wrongly
 * marked covered is a window nobody ever gets - there is no per-user cache to
 * expire and no request that would ever ask for it again.
 */
describe('planPriceFetch over ranges examined out of order', () => {
  const today = '2025-03-14'

  function examine(examined: DateRange[], ranges: DateRange[]): DateRange[] {
    return mergeRanges([...examined, ...ranges])
  }

  it('still asks for February after March and then January were fetched', () => {
    let examined: DateRange[] = []

    examined = examine(examined, planPriceFetch(examined, '2025-03-01', '2025-03-14', today))
    examined = examine(examined, planPriceFetch(examined, '2025-01-01', '2025-01-31', today))

    expect(planPriceFetch(examined, '2025-02-01', '2025-02-28', today)).toEqual([
      { from: '2025-02-01', to: '2025-02-28' },
    ])
  })

  it('still asks for February after January and then March were fetched', () => {
    let examined: DateRange[] = []

    examined = examine(examined, planPriceFetch(examined, '2025-01-01', '2025-01-31', today))
    examined = examine(examined, planPriceFetch(examined, '2025-03-01', '2025-03-14', today))

    expect(planPriceFetch(examined, '2025-02-01', '2025-02-28', today)).toEqual([
      { from: '2025-02-01', to: '2025-02-28' },
    ])
  })

  it('asks for every window between examined ranges, not just the outer ones', () => {
    const examined = [
      { from: '2025-01-01', to: '2025-01-10' },
      { from: '2025-02-01', to: '2025-02-10' },
      { from: '2025-03-01', to: '2025-03-10' },
    ]

    expect(planPriceFetch(examined, '2025-01-01', '2025-03-14', today)).toEqual([
      { from: '2025-01-11', to: '2025-01-31' },
      { from: '2025-02-11', to: '2025-02-28' },
      { from: '2025-03-11', to: '2025-03-14' },
    ])
  })
})

describe('rankCandidatesByTradePrice', () => {
  const candidates: InstrumentCandidate[] = [
    { symbol: 'FWIA.L', name: 'Fund (London)', currency: 'USD', exchange: 'LSE' },
    { symbol: 'FWIA.DE', name: 'Fund (Xetra)', currency: 'EUR', exchange: 'XETRA' },
    { symbol: 'FWIA.MI', name: 'Fund (Milan)', currency: 'EUR', exchange: 'MIL' },
  ]

  it('puts the listing whose close matches the executed price first', () => {
    const closes = new Map([
      ['FWIA.L', 108.4],
      ['FWIA.DE', 100.2],
      ['FWIA.MI', 100.9],
    ])

    const ranked = rankCandidatesByTradePrice(candidates, closes, 100)

    expect(ranked.map((candidate) => candidate.symbol)).toEqual(['FWIA.DE', 'FWIA.MI', 'FWIA.L'])
    expect(ranked[0].matches).toBe(true)
  })

  it('does not treat a listing that differs by an FX factor as a match', () => {
    const closes = new Map([['FWIA.L', 108.4]])

    const [ranked] = rankCandidatesByTradePrice([candidates[0]], closes, 100)

    expect(ranked.matches).toBe(false)
    expect(ranked.deviation).toBeCloseTo(0.084, 3)
  })

  it('keeps unpriced candidates, ordered last', () => {
    const closes = new Map<string, number | null>([['FWIA.DE', 100.2]])

    const ranked = rankCandidatesByTradePrice(candidates, closes, 100)

    expect(ranked[0].symbol).toBe('FWIA.DE')
    expect(ranked.slice(1).every((candidate) => candidate.close === null)).toBe(true)
    expect(ranked).toHaveLength(3)
  })
})
