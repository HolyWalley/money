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

/**
 * Anchored popups portal to the body, so the layout's own .pt-safe padding never
 * reaches them: a tall one expands to the physical top of the screen and its first
 * rows render behind the status bar. collisionPadding is the only prop that moves
 * both the placement and the --available-height the popup sizes itself from, and
 * it defaults to a flat 5px, so a Positioner that does not pass it is broken on a
 * notched phone. These files are shadcn output and get regenerated wholesale.
 */
describe('anchored popups', () => {
  const UI = join(SRC, 'components', 'ui')

  const positioners = readdirSync(UI)
    .filter(entry => /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry))
    .map(entry => ({
      name: entry,
      source: readFileSync(join(UI, entry), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1 '),
    }))
    .filter(file => /<\w+Primitive\.Positioner/.test(file.source))

  it('finds the components that position against an anchor', () => {
    expect(positioners.map(f => f.name).sort()).toEqual([
      'dropdown-menu.tsx',
      'popover.tsx',
      'select.tsx',
      'tooltip.tsx',
    ])
  })

  it.each(positioners.map(f => f.name))('%s keeps its popup out of the safe area', name => {
    const file = positioners.find(f => f.name === name)!
    expect(file.source).toMatch(/collisionPadding=\{/)
    expect(file.source).toMatch(/useSafeAreaCollisionPadding/)
  })
})

/**
 * The service worker update prompt is a sonner toast pinned top-center, so it is
 * positioned by neither the layout's padding nor a Positioner's collisionPadding.
 * Its offset variables are the only thing standing between the Reload button and
 * the status bar.
 */
describe('toast offsets', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')

  it.each(['--offset-top', '--mobile-offset-top'])('adds the top inset to %s', variable => {
    // Both are needed: sonner picks the mobile one below its own 600px breakpoint.
    expect(css).toMatch(
      new RegExp(`${variable}:\\s*calc\\([^)]*\\+\\s*env\\(safe-area-inset-top`)
    )
  })

  it('overrides sonner, which writes these offsets inline', () => {
    const rule = css.slice(css.indexOf('--offset-top:'))
    expect(rule.slice(0, rule.indexOf(';'))).toContain('!important')
  })

  /**
   * calc() rejects a bare 0 added to a length - number + length is a type error -
   * and the whole declaration is dropped, silently taking the safe-area handling
   * with it on any engine old enough to actually need the fallback.
   */
  it('gives every env() fallback inside calc() a unit', () => {
    const offenders = css
      .split('\n')
      .filter(line => line.includes('calc(') && /env\(\s*safe-area-inset-\w+\s*,\s*0\s*\)/.test(line))
      .map(line => line.trim())

    expect(offenders).toEqual([])
  })
})
