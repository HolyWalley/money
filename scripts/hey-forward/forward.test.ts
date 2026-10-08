// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import PostalMime from 'postal-mime'
import { forwardNotifications, receivedAt, type ForwardState } from './forward'

const MBANK_SEARCH = [
  {
    id: 11,
    topic_id: 101,
    subject: 'mBank - powiadomienie e-mail',
    messages: [{ id: 1001, created_at: '2026-10-08T06:14', creator: { email_address: 'kontakt@mbank.pl' } }],
  },
  {
    id: 12,
    topic_id: 102,
    subject: 'mBank - zestawienie operacji',
    messages: [{ id: 1002, created_at: '2026-10-01T06:00', creator: { email_address: 'kontakt@mbank.pl' } }],
  },
]

const PKO_SEARCH = [
  {
    id: 21,
    topic_id: 201,
    subject: 'Obciążenie konta',
    messages: [{ id: 2001, created_at: '2026-10-08T04:35', creator: { email_address: 'powiadomienia@pkobp.pl' } }],
  },
]

const PKO_THREAD = `<article id="entry-2001" data-entry-id="2001"><header>From: PKO</header><p>Obciążenie konta</p></article>`

/** A fake `hey` that answers the way the CLI does, and keeps what was sent. */
function fakeHey() {
  const sent: string[] = []
  const calls: string[][] = []
  const hey = vi.fn((args: string[]) => {
    calls.push(args)
    const envelope = (data: unknown) => JSON.stringify({ ok: true, data })
    const [command, sub] = args
    if (command === 'search' && args[1] === '--to') return envelope([{ id: 31, topic_id: 301, subject: 'Bank notification: x', messages: [] }])
    if (command === 'search') return envelope(args[2] === 'kontakt@mbank.pl' ? MBANK_SEARCH : PKO_SEARCH)
    if (command === 'attachment' && sub === 'list') {
      return envelope(
        args[2] === '101'
          ? [
              { id: '1001:1', message_id: 1001, filename: 'Powiadomienie e-mail z 2026-10-07.htm', content_type: 'text/html' },
              { id: '1001:2', message_id: 1001, filename: 'smime.p7s', content_type: 'application/pkcs7-signature' },
            ]
          : [{ id: '1002:1', message_id: 1002, filename: 'zestawienie.pdf', content_type: 'application/pdf' }]
      )
    }
    if (command === 'attachment' && sub === 'save') {
      writeFileSync(args[args.indexOf('--output') + 1], '<html>operacje</html>')
      return ''
    }
    if (command === 'thread') return PKO_THREAD
    if (command === 'compose') {
      sent.push(readFileSync(args[args.indexOf('--attach') + 1], 'utf8'))
      return ''
    }
    return ''
  })
  return { hey, sent, calls }
}

function run(state: ForwardState = { handled: [] }) {
  const fake = fakeHey()
  const saveState = vi.fn()
  const summary = forwardNotifications({ hey: fake.hey, inbox: 'abcdefghjkmnpqrs@in.yakau.dev', state, saveState })
  return { ...fake, saveState, summary, state }
}

describe('forwardNotifications', () => {
  it('sends each notification to the inbox as mail from its bank', async () => {
    const { sent, calls } = run()

    expect(sent).toHaveLength(2)
    const [mbank, pko] = await Promise.all(sent.map((eml) => PostalMime.parse(eml)))
    expect(mbank.from?.address).toBe('kontakt@mbank.pl')
    expect(mbank.messageId).toBe('<hey-1001@money.forward>')
    expect(mbank.attachments.map((attachment) => attachment.filename)).toEqual(['Powiadomienie e-mail z 2026-10-07.htm'])
    expect(pko.from?.address).toBe('powiadomienia@pkobp.pl')
    expect(pko.html?.trim()).toBe('<p>Obciążenie konta</p>')
    expect(Date.parse(pko.date!)).toBe(Date.UTC(2026, 9, 8, 4, 35))
    expect(calls.filter(([command]) => command === 'compose').every((args) => args.includes('abcdefghjkmnpqrs@in.yakau.dev'))).toBe(true)
  })

  it('marks the forwarded threads seen and leaves the rest alone', () => {
    const { calls, summary } = run()

    expect(calls.find(([command]) => command === 'seen')).toEqual(['seen', '11', '21'])
    expect(summary).toEqual({ forwarded: 2, skipped: 1, seen: 2 })
  })

  it('files the copies HEY kept of what it sent into the Paper Trail, read', () => {
    const { calls } = run()

    expect(calls).toContainEqual(['seen', '31'])
    expect(calls).toContainEqual(['move', '31', '--to', 'paper trail'])
  })

  it('remembers what it dealt with and never sends it again', () => {
    const first = run()
    expect(first.state.handled.sort()).toEqual([1001, 1002, 2001])
    expect(first.saveState).toHaveBeenCalledTimes(3)

    const second = run({ handled: first.state.handled })

    expect(second.sent).toEqual([])
    expect(second.calls.some(([command, id]) => command === 'seen' && id !== '31')).toBe(false)
  })

  it('writes the mail instead of sending it on a dry run', () => {
    const fake = fakeHey()
    const dir = `${process.env.TMPDIR ?? '/tmp'}/money-forward-test-${Date.now()}`

    forwardNotifications({ hey: fake.hey, inbox: 'x@in.yakau.dev', state: { handled: [] }, saveState: vi.fn(), dryRunDir: dir })

    expect(fake.sent).toEqual([])
    expect(fake.calls.some(([command]) => command === 'seen')).toBe(false)
    expect(existsSync(`${dir}/notification-1001.eml`)).toBe(true)
  })
})

describe('receivedAt', () => {
  it("reads HEY's zone-less timestamps as UTC", () => {
    expect(receivedAt('2026-10-08T06:14').toISOString()).toBe('2026-10-08T06:14:00.000Z')
    expect(receivedAt('2026-10-08T06:14:09Z').toISOString()).toBe('2026-10-08T06:14:09.000Z')
  })
})
