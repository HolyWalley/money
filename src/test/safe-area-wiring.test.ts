import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * .pb-safe-20 was written for the mobile nav's home-indicator inset and then
 * never applied to anything, so content sat under the nav on every notched
 * phone while the CSS looked like it had been handled. Nothing catches that:
 * an unused utility is valid CSS, and jsdom resolves env() to nothing so a
 * rendering test cannot see it either.
 *
 * These utilities exist only to be applied, so a defined-but-unreferenced one
 * is a bug by construction.
 */

const SRC = resolve(__dirname, '..')

function readSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...readSourceFiles(full))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      // Comments are stripped so that a comment merely naming a utility cannot
      // satisfy the check - which it otherwise does, since the comment above
      // the layout explains why pb-safe-20 is used there.
      out.push(
        readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
      )
    }
  }
  return out
}

describe('safe-area utilities', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')
  const defined = [...css.matchAll(/^\s*\.((?:p[tbrl]|p[xy])-safe[\w-]*)\s*\{/gm)].map(m => m[1])
  const sources = readSourceFiles(SRC).join('\n')

  it('defines the ones the app is known to need', () => {
    expect(defined).toContain('pt-safe')
    expect(defined).toContain('pb-safe-20')
  })

  it.each(['pt-safe', 'pb-safe-20'])('applies %s somewhere in the app', utility => {
    // Word boundary so pb-safe does not match inside pb-safe-20.
    expect(sources).toMatch(new RegExp(`\\b${utility}\\b`))
  })

  it('has no utility that is defined but never applied', () => {
    const unused = defined.filter(u => !new RegExp(`\\b${u}\\b`).test(sources))
    expect(unused).toEqual([])
  })

  it('reads the top inset from the environment rather than a fixed value', () => {
    // A hardcoded notch height is wrong on every device but the one it was
    // measured on, and wrong in the browser where the inset is zero.
    expect(css).toMatch(/\.pt-safe\s*\{\s*padding-top:\s*env\(safe-area-inset-top/)
  })
})
