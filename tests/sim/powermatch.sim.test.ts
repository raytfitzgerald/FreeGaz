import { describe, expect, it } from 'vitest'
import { simRig } from './rig'

describe('PowerMatch on the simulator', () => {
  it('steers ERG so pedals that read 5 % low still see 200 W, within 30 s', async () => {
    const rig = simRig()
    rig.world.enable('power')
    rig.world.powerMeter.offset = 0.95
    await rig.connect('trainer')
    await rig.connect('power')
    rig.controller.setDesired({ mode: 'erg', watts: 200 })
    await rig.advance(12_000) // soft start
    const pedals = () => rig.hub.meanOver('power', rig.clock.now() - 5000, rig.clock.now(), 'power:cps')!
    expect(Math.abs(pedals() - 200) / 200).toBeGreaterThan(0.03) // uncorrected: ~190 W on the pedals
    await rig.advance(30_000)
    expect(Math.abs(pedals() - 200) / 200).toBeLessThan(0.02)
    expect(rig.frame().trainer.powerMatch).toBeGreaterThan(1.03)
    rig.engine.stop()
    rig.devices.disconnectAll()
    rig.world.stop()
  })

  it('stays out of the way without pedals', async () => {
    const rig = simRig()
    await rig.connect('trainer')
    rig.controller.setDesired({ mode: 'erg', watts: 200 })
    await rig.advance(40_000)
    expect(rig.controller.currentSettings.powerMatchFactor).toBe(1)
    expect(rig.frame().trainer.powerMatch).toBeNull()
    rig.engine.stop()
    rig.devices.disconnectAll()
    rig.world.stop()
  })
})
