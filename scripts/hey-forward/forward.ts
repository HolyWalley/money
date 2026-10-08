import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bankNotificationSources, type BankNotificationSource } from '../../shared/bank-notifications.ts'
import { buildEml, entryBodyHtml } from './lib.ts'

/**
 * Passes bank notifications from HEY, which cannot redirect mail on its own,
 * to the money inbox, then marks them seen so they stay out of the Imbox.
 *
 *   node scripts/hey-forward/forward.ts <inbox address> [--dry-run <dir>]
 */

export type Hey = (args: string[]) => string

interface SearchResult {
  id: number | null
  topic_id: number
  subject: string
  messages: Array<{ id: number; created_at: string; creator?: { email_address?: string } }>
}

interface AttachmentRef {
  id: string
  message_id: number
  filename: string
  content_type: string
}

/** Notifications already dealt with, by HEY message id, so a run never sends one twice. */
export interface ForwardState {
  handled: number[]
}

export interface ForwardOptions {
  hey: Hey
  inbox: string
  state: ForwardState
  /** Called after each notification is dealt with, so a failure later loses nothing. */
  saveState: (state: ForwardState) => void
  /** Writes the .eml files here instead of sending them, and marks nothing seen. */
  dryRunDir?: string
  log?: (line: string) => void
}

export interface ForwardSummary {
  forwarded: number
  skipped: number
  seen: number
}

/** HEY's timestamps are UTC, though they do not always say so. */
export function receivedAt(createdAt: string): Date {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(createdAt) ? createdAt : `${createdAt}Z`)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function json<T>(hey: Hey, args: string[]): T {
  return JSON.parse(hey([...args, '--json'])).data as T
}

function documentOf(
  hey: Hey,
  source: BankNotificationSource,
  result: SearchResult,
  messageId: number,
  workDir: string
): { attachment?: { filename: string; contentType: string; bytes: Uint8Array }; html?: string } | null {
  if (source.content === 'body') {
    const html = entryBodyHtml(hey(['thread', 'read', String(result.topic_id), '--html']), messageId)
    return html ? { html } : null
  }

  const attachments = json<AttachmentRef[]>(hey, ['attachment', 'list', String(result.topic_id)])
  const wanted = attachments.find((attachment) => attachment.message_id === messageId && source.attachment.test(attachment.filename))
  if (!wanted) return null
  const path = join(workDir, `${messageId}-${wanted.filename.replace(/[^\w.-]/g, '_')}`)
  hey(['attachment', 'save', wanted.id, '--output', path, '--force'])
  return { attachment: { filename: wanted.filename, contentType: wanted.content_type, bytes: readFileSync(path) } }
}

/** The copies HEY keeps of what was sent to the inbox go to the Paper Trail, read, out of the Imbox. */
function fileSentCopies(hey: Hey, inbox: string): void {
  const sent = json<SearchResult[]>(hey, ['search', '--to', inbox, '--in', 'imbox', '--date', 'last_7_days', '--all'])
  const ids = sent.flatMap((result) => (result.id === null ? [] : [String(result.id)]))
  if (ids.length === 0) return
  hey(['seen', ...ids])
  hey(['move', ...ids, '--to', 'paper trail'])
}

export function forwardNotifications(options: ForwardOptions): ForwardSummary {
  const { hey, inbox, state, saveState, dryRunDir, log = () => {} } = options
  const handled = new Set(state.handled)
  const summary: ForwardSummary = { forwarded: 0, skipped: 0, seen: 0 }
  const toSee: number[] = []
  if (dryRunDir) mkdirSync(dryRunDir, { recursive: true })
  const workDir = dryRunDir ?? mkdtempSync(join(tmpdir(), 'money-hey-forward-'))

  const remember = (messageId: number) => {
    handled.add(messageId)
    state.handled = [...handled]
    saveState(state)
  }

  try {
    for (const source of bankNotificationSources) {
      const results = json<SearchResult[]>(hey, ['search', '--from', source.sender, '--date', 'last_7_days', '--all'])

      for (const result of results) {
        let forwardedHere = false
        for (const message of result.messages) {
          if (handled.has(message.id)) continue
          const from = message.creator?.email_address?.toLowerCase()
          const document = from && from !== source.sender ? null : documentOf(hey, source, result, message.id, workDir)
          if (!document) {
            // A statement or a reply in the thread: nothing for the inbox, and left for the person to see.
            log(`skipped ${message.id} (${result.subject}): no notification in it`)
            summary.skipped += 1
            remember(message.id)
            continue
          }

          const emlPath = join(workDir, `notification-${message.id}.eml`)
          writeFileSync(
            emlPath,
            buildEml({
              sender: source.sender,
              subject: result.subject,
              messageId: `<hey-${message.id}@money.forward>`,
              date: receivedAt(message.created_at),
              ...document,
            })
          )
          if (!dryRunDir) {
            hey(['compose', '--to', inbox, '--subject', `Bank notification: ${result.subject}`, '--attach', emlPath, '-m', 'Forwarded for money.'])
          }
          log(`${dryRunDir ? 'wrote' : 'forwarded'} ${message.id} (${result.subject})`)
          summary.forwarded += 1
          forwardedHere = true
          remember(message.id)
        }
        if (forwardedHere && result.id !== null) toSee.push(result.id)
      }
    }

    if (toSee.length > 0 && !dryRunDir) {
      hey(['seen', ...toSee.map(String)])
      summary.seen = toSee.length
    }
    if (!dryRunDir) fileSentCopies(hey, inbox)
    return summary
  } finally {
    if (!dryRunDir) rmSync(workDir, { recursive: true, force: true })
  }
}

function runHey(args: string[]): string {
  return execFileSync('hey', args, {
    encoding: 'utf8',
    env: { ...process.env, HEY_NONINTERACTIVE: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
}

function main(): void {
  const args = process.argv.slice(2)
  const dryRunAt = args.indexOf('--dry-run')
  const dryRunDir = dryRunAt === -1 ? undefined : args[dryRunAt + 1]
  const inbox = args.find((arg, index) => !arg.startsWith('--') && (dryRunAt === -1 || index !== dryRunAt + 1)) ?? process.env.MONEY_INBOX
  if (!inbox || (dryRunAt !== -1 && !dryRunDir)) {
    console.error('usage: node scripts/hey-forward/forward.ts <inbox address> [--dry-run <dir>]')
    process.exit(1)
  }

  const statePath = process.env.MONEY_FORWARD_STATE ?? join(homedir(), '.local', 'state', 'money-hey-forward.json')
  let state: ForwardState = { handled: [] }
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8')) as ForwardState
  } catch {
    // First run: nothing handled yet.
  }
  const summary = forwardNotifications({
    hey: runHey,
    inbox,
    state,
    dryRunDir,
    // A dry run must not record what it only wrote to disk.
    saveState: (next) => {
      if (dryRunDir) return
      mkdirSync(dirname(statePath), { recursive: true })
      // The newest few hundred are plenty: a seven-day search reaches no further back.
      writeFileSync(statePath, JSON.stringify({ handled: next.handled.slice(-500) }))
    },
    log: (line) => console.log(`${new Date().toISOString()} ${line}`),
  })
  console.log(`${new Date().toISOString()} done: ${summary.forwarded} forwarded, ${summary.skipped} skipped, ${summary.seen} marked seen`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
