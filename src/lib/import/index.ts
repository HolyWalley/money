import { degiroParser } from './degiro'
import { revolutParser } from './revolut'
import type { BrokerId, ParsedStatement, StatementParser } from './types'

/**
 * The statement formats the app can read, in the order files are tested
 * against them.
 *
 * Order is not significant today - DeGiro's detector wants a twelve-field
 * header and Revolut's wants four named columns no other export carries, so no
 * file answers to both - but a third parser added later inherits whatever
 * position it is given here, so it stays deliberate.
 */
const parsers: readonly StatementParser[] = [degiroParser, revolutParser]

export interface SupportedBroker {
  broker: BrokerId
  /** The broker's own name, spelled the way it spells it. */
  name: string
  /** Where the file comes from, so a user with no matching file knows what to export. */
  export: string
}

export const supportedBrokers: readonly SupportedBroker[] = [
  { broker: 'degiro', name: 'DEGIRO', export: 'Account.csv, from Reports → Account statement' },
  { broker: 'revolut', name: 'Revolut', export: 'the Invest account statement CSV' },
]

export function brokerName(broker: BrokerId): string {
  return supportedBrokers.find((entry) => entry.broker === broker)?.name ?? broker
}

/**
 * A detection either names the parser or says why nothing matched. The reason
 * is a whole sentence: it is shown verbatim to someone who has just picked the
 * wrong file and needs to know which file to pick instead.
 */
export type StatementDetection =
  | { parser: StatementParser; reason?: undefined }
  | { parser: null; reason: string }

function unsupportedReason(): string {
  const names = supportedBrokers.map((entry) => entry.name)
  const list = names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0]
  return `This file does not look like a statement from ${list}.`
}

export function detectStatement(text: string): StatementDetection {
  if (!text.trim()) {
    return { parser: null, reason: 'That file is empty, so there is nothing to import.' }
  }

  const parser = parsers.find((candidate) => candidate.detect(text))
  if (!parser) return { parser: null, reason: unsupportedReason() }

  return { parser }
}

export type StatementParseResult =
  | { statement: ParsedStatement; reason?: undefined }
  | { statement: null; reason: string }

/**
 * Detect and parse in one step. Neither parser throws - an unreadable file
 * comes back as a statement carrying warnings - so a caller only ever has to
 * handle "nothing recognised it".
 */
export function parseStatement(text: string): StatementParseResult {
  const detected = detectStatement(text)
  if (!detected.parser) return { statement: null, reason: detected.reason }

  return { statement: detected.parser.parse(text) }
}

export type { BrokerId, ParsedRow, ParsedRowKind, ParsedStatement, StatementParser } from './types'
