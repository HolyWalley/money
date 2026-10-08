// @vitest-environment node
import { describe, expect, it } from 'vitest'
import PostalMime from 'postal-mime'
import { buildEml, entryBodyHtml, unwrapHeyBody } from './lib'

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A body the way HEY serves an inbound email: the email inside a Trix figure, inside a template. */
function heyWrapped(html: string): string {
  const trix = JSON.stringify({ contentType: 'text/html', content: `<shadow-content><template>${html}</template></shadow-content>` })
  return `<figure data-trix-attachment="${escapeAttribute(trix)}"></figure>`
}

describe('unwrapHeyBody', () => {
  it("returns the email's own HTML from HEY's wrapper", () => {
    expect(unwrapHeyBody(heyWrapped('<p>Obciążenie konta &gt; 5 zł</p>'))).toBe('<p>Obciążenie konta &gt; 5 zł</p>')
  })

  it('returns a body without a wrapper as it is', () => {
    expect(unwrapHeyBody('<p>plain</p>')).toBe('<p>plain</p>')
  })
})

describe('entryBodyHtml', () => {
  const thread = `<!doctype html><html><body>
    <article id="entry-1" data-entry-id="1"><header><div>From: PKO</div></header>${heyWrapped('<p>first</p>')}</article>
    <article id="entry-2" data-entry-id="2"><header><div>From: PKO</div></header>${heyWrapped('<p>second</p>')}</article>
  </body></html>`

  it("returns one entry's email, without HEY's header rows", () => {
    expect(entryBodyHtml(thread, 2)).toBe('<p>second</p>')
  })

  it('answers null for an entry the thread does not have', () => {
    expect(entryBodyHtml(thread, 3)).toBeNull()
  })
})

describe('buildEml', () => {
  const base = {
    sender: 'kontakt@mbank.pl',
    subject: 'mBank - powiadomienie e-mail',
    messageId: '<hey-1@money.forward>',
    date: new Date(Date.UTC(2026, 9, 8, 6, 14)),
  }

  it('rebuilds an attachment notification as mail from the bank', async () => {
    const bytes = new TextEncoder().encode('<html>operacje</html>')

    const email = await PostalMime.parse(
      buildEml({ ...base, attachment: { filename: 'Powiadomienie e-mail z 2026-10-07.htm', contentType: 'text/html', bytes } })
    )

    expect(email.from?.address).toBe('kontakt@mbank.pl')
    expect(email.messageId).toBe('<hey-1@money.forward>')
    expect(Date.parse(email.date!)).toBe(base.date.getTime())
    expect(email.attachments.map((attachment) => attachment.filename)).toEqual(['Powiadomienie e-mail z 2026-10-07.htm'])
    expect(new TextDecoder().decode(email.attachments[0].content as ArrayBuffer)).toBe('<html>operacje</html>')
  })

  it('rebuilds a body notification with its Polish text intact', async () => {
    const email = await PostalMime.parse(
      buildEml({ ...base, sender: 'powiadomienia@pkobp.pl', subject: 'Obciążenie konta', html: '<p>Obciążenie konta</p>' })
    )

    expect(email.subject).toBe('Obciążenie konta')
    expect(email.html?.trim()).toBe('<p>Obciążenie konta</p>')
  })
})
