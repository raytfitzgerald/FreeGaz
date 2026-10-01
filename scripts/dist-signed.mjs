#!/usr/bin/env node
// Builds the release DMG signed with a Developer ID, hardened, notarized and
// stapled, so it opens without the Gatekeeper warning. `npm run dist` stays the
// ad-hoc build that CI and anyone without an Apple Developer account use.
//
// Needs, once per Mac (see README → Releasing a signed build):
// - a "Developer ID Application" certificate in the login keychain;
// - notarytool credentials saved as a keychain profile, `freegaz` by default
//   (override with FREEGAZ_NOTARY_PROFILE).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const profile = process.env.FREEGAZ_NOTARY_PROFILE ?? 'freegaz'
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const dir = `release/${version}`
const app = `${dir}/mac-arm64/FreeGaz.app`
const dmg = `${dir}/FreeGaz-${version}-arm64.dmg`

const run = (cmd, args, env) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
const read = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const fail = (msg) => {
  console.error(`\n${msg}\n`)
  process.exit(1)
}

// The identity electron-builder wants is the certificate name without its
// "Developer ID Application: " prefix, e.g. "Jane Doe (AB12CD34EF)".
const identities = read('security', ['find-identity', '-v', '-p', 'codesigning'])
const match = identities.match(/"Developer ID Application: ([^"]+)"/)
if (!match) fail('No valid "Developer ID Application" certificate in the keychain. See README → Releasing a signed build.')
const identity = match[1]

try {
  read('xcrun', ['notarytool', 'history', '--keychain-profile', profile])
} catch {
  fail(`The notarytool keychain profile "${profile}" is missing or its password no longer works. See README → Releasing a signed build.`)
}

console.log(`Signing as "Developer ID Application: ${identity}", notarizing with profile "${profile}".\n`)

run('npm', ['run', 'build'])
run(
  'npx',
  [
    'electron-builder', '--mac', '--publish', 'never',
    `-c.mac.identity=${identity}`,
    '-c.mac.hardenedRuntime=true',
    '-c.mac.gatekeeperAssess=false',
    '-c.mac.entitlements=build/entitlements.mac.plist',
    '-c.mac.entitlementsInherit=build/entitlements.mac.plist',
    '-c.mac.notarize=true',
    '-c.dmg.sign=true',
  ],
  // electron-builder notarizes (and staples) the app with this profile.
  { APPLE_KEYCHAIN_PROFILE: profile, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
)

// Notarize and staple the DMG too, so the download itself passes Gatekeeper,
// offline included.
run('xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', profile, '--wait'])
run('xcrun', ['stapler', 'staple', dmg])

// Check it the way Gatekeeper will.
run('xcrun', ['stapler', 'validate', dmg])
run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '-vv', dmg])
run('spctl', ['--assess', '--type', 'execute', '-vv', app])

console.log(`\nSigned, notarized and stapled: ${dmg}`)
