// Plain string allowlists for the preload bridge. The preload must stay tiny and
// must not bundle zod, so it cannot import ./contract directly.
// `contract.test.ts` fails if these drift from the contract.

export const INVOKE_CHANNELS = [
  'app.ping',
  'app.info',
  'settings.get',
  'settings.patch',
  'ble.prepare',
  'ble.choose',
  'ble.requestAutoConnect',
] as const

export const EVENT_CHANNELS = ['app.log', 'settings.changed', 'ble.chooser', 'ble.chosen'] as const
