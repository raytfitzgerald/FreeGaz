// Keeps the iPhone app's version in step with package.json, so the App Store
// build says the same version as the Mac app. Run by `npm run ios:sync`.
// The build number (CURRENT_PROJECT_VERSION) goes up by one per upload: pass --bump.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const file = join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj')
let s = readFileSync(file, 'utf8').replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
if (process.argv.includes('--bump')) {
  const build = Math.max(...[...s.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1])), 0) + 1
  s = s.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`)
  console.log(`iOS ${version} (build ${build})`)
} else console.log(`iOS ${version}`)
writeFileSync(file, s)
