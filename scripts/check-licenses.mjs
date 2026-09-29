#!/usr/bin/env node
// Fails if any package that ships in the app (the production dependency tree)
// has a license we cannot redistribute under MIT: GPL/AGPL/LGPL/SSPL, custom
// "internal use" licenses (e.g. Garmin's FIT Protocol License) or no license.
// Garmin's @garmin/fitsdk is a devDependency (test-only) and is never shipped.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ALLOWED = new Set([
  'MIT', 'MIT-0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'BlueOak-1.0.0',
  'CC0-1.0', 'CC-BY-4.0', 'Unlicense', 'Zlib', 'Python-2.0', 'WTFPL',
])
// Weak, file-level copyleft: fine to ship unmodified in an MIT app, but flag it.
const REVIEW = new Set(['MPL-2.0'])

const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], { encoding: 'utf8', maxBuffer: 64 << 20 }))
const seen = new Map()

function walk(deps, parentPath) {
  for (const [name, info] of Object.entries(deps ?? {})) {
    const key = `${name}@${info.version}`
    if (seen.has(key)) continue
    const dir = info.path ?? join(parentPath, 'node_modules', name)
    let license
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses?.map((l) => l.type).join(' OR ') || 'UNKNOWN')
    } catch {
      // optional dependency that isn't installed on this platform
      continue
    }
    seen.set(key, license)
    walk(info.dependencies, dir)
  }
}
walk(tree.dependencies, process.cwd())

const options = (expr) => expr.replace(/[()]/g, '').split(/\s+OR\s+/i).map((s) => s.trim())
const isAllowed = (expr) => options(expr).some((o) => ALLOWED.has(o) || o.split(/\s+AND\s+/i).every((p) => ALLOWED.has(p)))
const needsReview = (expr) => options(expr).some((o) => REVIEW.has(o))

const bad = []
const review = []
for (const [pkg, license] of [...seen.entries()].sort()) {
  if (isAllowed(license)) continue
  if (needsReview(license)) review.push(`${pkg}: ${license}`)
  else bad.push(`${pkg}: ${license}`)
}

console.log(`Checked ${seen.size} shipped packages.`)
if (review.length) console.log(`Review (weak copyleft, allowed):\n  ${review.join('\n  ')}`)
if (bad.length) {
  console.error(`Disallowed or unknown licenses:\n  ${bad.join('\n  ')}`)
  process.exit(1)
}
console.log('All shipped dependency licenses are MIT-compatible.')
