import { expect, it } from 'vitest'
import { simRig } from './rig'

// The simulated strap sends RR intervals; the engine turns them into live HRV.
it('fills in RMSSD and DFA-α1 once two minutes of beats have arrived', async () => {
  const rig = simRig()
  await rig.connect('trainer')
  await rig.connect('hr')
  rig.controller.setDesired({ mode: 'erg', watts: 150 })
  await rig.advance(150_000, 250)
  const f = rig.frame()
  expect(f.rmssd).not.toBeNull()
  expect(f.dfaA1).not.toBeNull()
  expect(f.dfaA1!).toBeGreaterThan(0.2)
  expect(f.dfaA1!).toBeLessThan(1.8)
  rig.engine.stop()
  rig.devices.disconnectAll()
  rig.world.stop()
})
