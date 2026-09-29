import { afterEach, describe, expect, it } from 'vitest'
import { simRig } from './rig'

// M1 exit criteria, headless: real GATT bytes through the real FTMS driver.
describe('simulated KICKR over FTMS', () => {
  let rig: ReturnType<typeof simRig>
  afterEach(() => {
    rig.engine.stop()
    rig.devices.disconnectAll()
    rig.world.stop()
  })

  it('connects over FTMS and takes control: Request Control, then Start', async () => {
    rig = simRig()
    const dev = await rig.connect('trainer')
    await rig.connect('hr')
    expect(dev.name).toBe('SIM KICKR 0001')
    expect(dev.drivers).toEqual(['ftms'])
    rig.controller.setDesired({ mode: 'erg', watts: 150 })
    await rig.advance(2000)
    expect(rig.world.trainer.commandLog.map((c) => c.op).slice(0, 3)).toEqual(['requestControl', 'start', 'targetPower'])
    expect(rig.world.trainer.hasControl).toBe(true)
    expect(rig.hub.value('hr', rig.clock.now())).not.toBeNull()
  })

  it('ERG 200 W: power converges to 200 ± 5 W within 5 s and holds', async () => {
    rig = simRig()
    await rig.connect('trainer')
    rig.controller.setDesired({ mode: 'erg', watts: 150 })
    await rig.advance(20_000) // past the 10 s soft start
    rig.controller.setDesired({ mode: 'erg', watts: 200 })
    const t0 = rig.clock.now()
    let reachedAt: number | null = null
    while (reachedAt === null && rig.clock.now() - t0 < 5000) {
      await rig.advance(250)
      const p = rig.power()
      if (p !== null && Math.abs(p - 200) <= 5) reachedAt = rig.clock.now() - t0
    }
    expect(reachedAt).not.toBeNull()
    expect(reachedAt!).toBeLessThan(5000)
    const held: number[] = []
    for (let i = 0; i < 20; i++) {
      await rig.advance(1000)
      held.push(rig.power()!)
    }
    // It holds: the mean sits on target and the 1 % sensor noise stays small.
    expect(Math.abs(held.reduce((a, b) => a + b, 0) / held.length - 200)).toBeLessThanOrEqual(2)
    for (const p of held) expect(Math.abs(p - 200)).toBeLessThanOrEqual(10)
  })

  it('forced disconnect: reconnects, re-acquires control and re-sends the target within 3 s', async () => {
    rig = simRig()
    await rig.connect('trainer')
    rig.controller.setDesired({ mode: 'erg', watts: 200 })
    await rig.advance(20_000)
    const log = rig.world.trainer.commandLog
    log.length = 0
    const t0 = rig.clock.now()
    rig.world.trainer.drop(200)
    const summary = () => log.map((c) => (c.op === 'targetPower' ? `targetPower:${(c.detail as { watts?: number } | undefined)?.watts}` : c.op))
    while (!summary().includes('targetPower:200') && rig.clock.now() - t0 < 3000) await rig.advance(100)
    expect(rig.clock.now() - t0).toBeLessThan(3000)
    const ops = summary()
    expect(ops.indexOf('requestControl')).toBeGreaterThanOrEqual(0)
    expect(ops.indexOf('requestControl')).toBeLessThan(ops.indexOf('start'))
    expect(ops.indexOf('start')).toBeLessThan(ops.indexOf('targetPower:200'))
    expect(rig.devices.get('trainer')?.state).toBe('connected')
  })

  it('another app stealing control is reported, and control comes back once it lets go', async () => {
    rig = simRig()
    await rig.connect('trainer')
    const lost: string[] = []
    rig.controller.on((e) => {
      if (e.type === 'control-lost') lost.push('lost')
    })
    rig.controller.setDesired({ mode: 'erg', watts: 180 })
    await rig.advance(3000)
    rig.world.trainer.stealControl()
    rig.controller.setDesired({ mode: 'erg', watts: 190 })
    await rig.advance(3000)
    expect(lost.length).toBeGreaterThan(0)
    expect(rig.frame().trainer.controlLost).toBe(true)
    // Refusals are retried every 5 s, not hammered at the tick rate.
    const requests = rig.world.trainer.commandLog.filter((c) => c.op === 'requestControl' && c.t > 3010).length
    expect(requests).toBeLessThanOrEqual(2)
    rig.world.trainer.releaseControl()
    await rig.advance(10_000)
    expect(rig.world.trainer.hasControl).toBe(true)
    expect(rig.world.trainer.targetW).toBe(190)
    expect(rig.frame().trainer.controlLost).toBe(false)
  })
})
