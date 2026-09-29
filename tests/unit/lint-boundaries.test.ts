// Guards the architecture: ESLint must reject forbidden imports in each layer.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: process.cwd() })

async function errorsFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? m.message)
}

describe('import boundaries', () => {
  it('core may not import electron', async () => {
    expect(await errorsFor('src/core/__fixture__.ts', "import { app } from 'electron'\nexport const x = app\n")).toContain(
      'no-restricted-imports',
    )
  })

  it('core may not import node builtins or touch window', async () => {
    const errs = await errorsFor('src/core/__fixture__.ts', "import fs from 'node:fs'\nexport const x = [fs, window]\n")
    expect(errs).toContain('no-restricted-imports')
    expect(errs).toContain('no-restricted-globals')
  })

  it('core may not import react', async () => {
    expect(await errorsFor('src/core/__fixture__.ts', "import { useState } from 'react'\nexport const x = useState\n")).toContain(
      'no-restricted-imports',
    )
  })

  it('renderer may not import electron or node', async () => {
    const errs = await errorsFor(
      'src/renderer/src/__fixture__.ts',
      "import { ipcRenderer } from 'electron'\nimport path from 'node:path'\nexport const x = [ipcRenderer, path]\n",
    )
    expect(errs.filter((e) => e === 'no-restricted-imports')).toHaveLength(2)
  })

  it('main may not import react', async () => {
    expect(await errorsFor('src/main/__fixture__.ts', "import React from 'react'\nexport const x = React\n")).toContain(
      'no-restricted-imports',
    )
  })

  it('clean core code passes', async () => {
    expect(await errorsFor('src/core/__fixture__.ts', 'export const add = (a: number, b: number): number => a + b\n')).toEqual([])
  })
})
