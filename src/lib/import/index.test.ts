import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brokerName, detectStatement, parseStatement, supportedBrokers } from './index'
import {
  DEGIRO_FIXTURE,
  REVOLUT_FIXTURE,
  expectedDegiroRowTotal,
  expectedRevolutRowTotal,
} from './__fixtures__/expected'

const FIXTURES = join(__dirname, '__fixtures__')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

const OTHER_BANK_CSV = [
  'Date,Description,Amount,Balance',
  '2024-01-04,Coffee,-3.50,120.10',
  '',
].join('\n')

describe('detectStatement', () => {
  it('recognises a DeGiro account statement', () => {
    const detected = detectStatement(fixture(DEGIRO_FIXTURE))

    expect(detected.parser?.broker).toBe('degiro')
  })

  it('recognises a Revolut trading statement', () => {
    const detected = detectStatement(fixture(REVOLUT_FIXTURE))

    expect(detected.parser?.broker).toBe('revolut')
  })

  // Each detector has to refuse the other broker's file, or the first one in
  // the registry would swallow every statement.
  it('does not let either parser claim the other broker file', () => {
    const parsers = [detectStatement(fixture(DEGIRO_FIXTURE)).parser, detectStatement(fixture(REVOLUT_FIXTURE)).parser]

    expect(parsers[0]).not.toBe(parsers[1])
  })

  it('names every supported broker when nothing matches', () => {
    const detected = detectStatement(OTHER_BANK_CSV)

    expect(detected.parser).toBeNull()
    for (const broker of supportedBrokers) {
      expect(detected.reason).toContain(broker.name)
    }
  })

  it('says a file is empty rather than that it is the wrong format', () => {
    const detected = detectStatement('   \n\n')

    expect(detected.parser).toBeNull()
    expect(detected.reason).toContain('empty')
  })
})

describe('parseStatement', () => {
  it('reads every row of a DeGiro statement', () => {
    const result = parseStatement(fixture(DEGIRO_FIXTURE))

    expect(result.statement?.broker).toBe('degiro')
    expect(result.statement?.rows).toHaveLength(expectedDegiroRowTotal)
  })

  it('reads every row of a Revolut statement', () => {
    const result = parseStatement(fixture(REVOLUT_FIXTURE))

    expect(result.statement?.broker).toBe('revolut')
    expect(result.statement?.rows).toHaveLength(expectedRevolutRowTotal)
  })

  it('hands back the detection reason instead of an empty statement', () => {
    const result = parseStatement(OTHER_BANK_CSV)

    expect(result.statement).toBeNull()
    expect(result.reason).toBeTruthy()
  })
})

describe('supportedBrokers', () => {
  it('tells the user which export to look for at each broker', () => {
    for (const broker of supportedBrokers) {
      expect(broker.export).toBeTruthy()
      expect(brokerName(broker.broker)).toBe(broker.name)
    }
  })

  it('covers both brokers the app can parse', () => {
    expect(supportedBrokers.map(broker => broker.broker).sort()).toEqual(['degiro', 'revolut'])
  })
})
