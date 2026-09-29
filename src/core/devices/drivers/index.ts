// Driver selection. Inspects the services a freshly connected device exposes
// and returns the driver(s) for the requested role.
//
// Trainer priority (never two control protocols at once):
//   1. FTMS, if the Feature characteristic advertises power or simulation targets
//   2. Wahoo proprietary control inside Cycling Power
//   3. Plain Cycling Power: a power-only "trainer" with no control
import { parseFtmsFeatures } from '../../ble/codecs'
import type { GattSession } from '../../ble/transport'
import { CHAR, SERVICE } from '../../ble/uuids'
import type { Driver, DriverFactory } from '../driver'
import type { DeviceRole } from '../types'
import { FtmsTrainerDriver } from './ftms-trainer'
import { HeadwindDriver } from './headwind'
import { CoreTempDriver, CscDriver, HeartRateDriver, MoxyDriver, PowerMeterDriver } from './sensors'
import { WahooTrainerDriver } from './wahoo-trainer'

export { FtmsTrainerDriver, HeadwindDriver, WahooTrainerDriver, HeartRateDriver, PowerMeterDriver, CscDriver, CoreTempDriver, MoxyDriver }

async function trainerDrivers(session: GattSession, services: string[]): Promise<Driver[]> {
  if (services.includes(SERVICE.fitnessMachine)) {
    const chars = await session.characteristics(SERVICE.fitnessMachine)
    if (chars.includes(CHAR.indoorBikeData)) {
      let features = null
      if (chars.includes(CHAR.fitnessMachineFeature)) {
        try {
          features = parseFtmsFeatures(await session.read(SERVICE.fitnessMachine, CHAR.fitnessMachineFeature))
        } catch {
          features = null
        }
      }
      if (!features || features.target.power || features.target.simulation || features.target.resistance) {
        return [new FtmsTrainerDriver(features)]
      }
    }
  }
  if (services.includes(SERVICE.cyclingPower)) {
    const chars = await session.characteristics(SERVICE.cyclingPower)
    if (chars.includes(CHAR.wahooTrainerControl)) return [new WahooTrainerDriver()]
    return [new PowerMeterDriver('trainer')]
  }
  return []
}

export const defaultDriverFactory: DriverFactory = async (session, role: DeviceRole) => {
  const services = await session.services()
  const has = (s: string) => services.includes(s)
  switch (role) {
    case 'trainer':
      return trainerDrivers(session, services)
    case 'hr':
      return has(SERVICE.heartRate) ? [new HeartRateDriver()] : []
    case 'power':
      return has(SERVICE.cyclingPower) ? [new PowerMeterDriver()] : []
    case 'cadence':
      return has(SERVICE.cyclingSpeedCadence) ? [new CscDriver()] : []
    case 'coreTemp':
      return has(SERVICE.coreTemp) ? [new CoreTempDriver()] : []
    case 'smo2':
      return has(SERVICE.moxy) ? [new MoxyDriver()] : []
    case 'fan':
      return has(SERVICE.wahooHeadwind) || has(SERVICE.wahooHeadwindAlt) ? [new HeadwindDriver()] : []
  }
}
