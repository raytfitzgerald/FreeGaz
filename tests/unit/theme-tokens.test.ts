// Tailwind v4 only emits a theme variable once it sees something use it. The
// zone and grade colours are looked up by computed name (zoneVar, zoneHex,
// gradeVar), which its scanner can't see, so styles.css keeps them in
// `@theme static`. Compiling it with no candidates at all proves they still ship.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'tailwindcss'
import { beforeAll, describe, expect, it } from 'vitest'
import { GRADE_CLASSES, gradeVar } from '@renderer/routes/grade'
import { POWER_ZONE_SHORT, zoneVar } from '@renderer/ui/zones'

const STYLES = fileURLToPath(new URL('../../src/renderer/src/styles.css', import.meta.url))
const require = createRequire(import.meta.url)

/** Variables in the :root theme layer when no class or source file uses anything. */
async function bareThemeVars(): Promise<Set<string>> {
  const compiler = await compile(await readFile(STYLES, 'utf8'), {
    base: dirname(STYLES),
    loadStylesheet: async (id, base) => {
      // `@import "tailwindcss"` means the package's stylesheet, not its JS entry.
      const path = require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, { paths: [base] })
      return { path, base: dirname(path), content: await readFile(path, 'utf8') }
    },
  })
  // Only this block counts: the light theme's overrides further down declare
  // the same names and would hide a missing dark default.
  const layer = compiler.build([]).match(/@layer theme\s*\{\s*:root,\s*:host\s*\{([^}]*)\}/)?.[1] ?? ''
  return new Set([...layer.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1] ?? ''))
}

const tokenOf = (varRef: string): string => varRef.replace(/^var\((--[\w-]+)\)$/, '$1')

describe('theme tokens looked up by computed name', () => {
  let shipped = new Set<string>()
  beforeAll(async () => {
    shipped = await bareThemeVars()
  })
  const missing = (tokens: string[]) => tokens.filter((t) => !shipped.has(t))

  it('finds the theme layer in the compiled CSS', () => {
    expect(shipped.size).toBeGreaterThan(0)
  })

  it('ships every power-zone colour', () => {
    const tokens = POWER_ZONE_SHORT.map((_, i) => tokenOf(zoneVar(i)))
    expect(missing(tokens), 'keep these in a @theme static block').toEqual([])
  })

  it('ships every grade colour', () => {
    const tokens = GRADE_CLASSES.map((_, i) => tokenOf(gradeVar(i)))
    expect(missing(tokens), 'keep these in a @theme static block').toEqual([])
  })
})
