// Bluetooth GATT UUIDs used by FreeGaz, as full 128-bit lowercase strings
// (the form Web Bluetooth and noble both accept).

/** Expands a 16-bit SIG-assigned UUID to its 128-bit form. */
export function uuid16(short: number): string {
  return `0000${short.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`
}

/** Normalizes any UUID spelling (16-bit number, short hex, upper-case) to 128-bit lowercase. */
export function normalizeUuid(u: string | number): string {
  if (typeof u === 'number') return uuid16(u)
  const s = u.toLowerCase()
  if (/^[0-9a-f]{4}$/.test(s)) return uuid16(parseInt(s, 16))
  if (/^0x[0-9a-f]{4}$/.test(s)) return uuid16(parseInt(s.slice(2), 16))
  return s
}

export const SERVICE = {
  genericAccess: uuid16(0x1800),
  deviceInformation: uuid16(0x180a),
  battery: uuid16(0x180f),
  heartRate: uuid16(0x180d),
  cyclingSpeedCadence: uuid16(0x1816),
  cyclingPower: uuid16(0x1818),
  fitnessMachine: uuid16(0x1826),
  /** CORE body temperature sensor (public spec v2.2). */
  coreTemp: '00002100-5b1e-4347-b07c-97b514dae121',
  /** Wahoo KICKR Headwind fan. Sources disagree between ...ee0c and ...ee0b; accept both. */
  wahooHeadwind: 'a026ee0c-0a7d-4ab3-97fa-f1500f9feb8b',
  wahooHeadwindAlt: 'a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b',
  /** Moxy muscle oxygen monitor (unofficial, community-documented). */
  moxy: '6404d801-4cb9-11e8-b566-0800200c9a66',
  /** Tacx FE-C over BLE (backlog). */
  tacxFec: '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e',
} as const

export const CHAR = {
  // Device Information
  manufacturerName: uuid16(0x2a29),
  modelNumber: uuid16(0x2a24),
  hardwareRevision: uuid16(0x2a27),
  firmwareRevision: uuid16(0x2a26),
  softwareRevision: uuid16(0x2a28),
  // Battery
  batteryLevel: uuid16(0x2a19),
  // Heart Rate
  heartRateMeasurement: uuid16(0x2a37),
  bodySensorLocation: uuid16(0x2a38),
  // Cycling Speed & Cadence
  cscMeasurement: uuid16(0x2a5b),
  cscFeature: uuid16(0x2a5c),
  // Cycling Power
  cyclingPowerMeasurement: uuid16(0x2a63),
  cyclingPowerVector: uuid16(0x2a64),
  cyclingPowerFeature: uuid16(0x2a65),
  cyclingPowerControlPoint: uuid16(0x2a66),
  sensorLocation: uuid16(0x2a5d),
  // Fitness Machine
  fitnessMachineFeature: uuid16(0x2acc),
  indoorBikeData: uuid16(0x2ad2),
  trainingStatus: uuid16(0x2ad3),
  supportedSpeedRange: uuid16(0x2ad4),
  supportedInclinationRange: uuid16(0x2ad5),
  supportedResistanceLevelRange: uuid16(0x2ad6),
  supportedHeartRateRange: uuid16(0x2ad7),
  supportedPowerRange: uuid16(0x2ad8),
  fitnessMachineControlPoint: uuid16(0x2ad9),
  fitnessMachineStatus: uuid16(0x2ada),
  // Wahoo proprietary trainer control, lives inside the Cycling Power service.
  wahooTrainerControl: 'a026e005-0a7d-4ab3-97fa-f1500f9feb8b',
  // KICKR Headwind control point (write-without-response + notify).
  wahooHeadwindControl: 'a026e038-0a7d-4ab3-97fa-f1500f9feb8b',
  // CORE
  coreTempMeasurement: '00002101-5b1e-4347-b07c-97b514dae121',
  coreTempControlPoint: '00002102-5b1e-4347-b07c-97b514dae121',
  // Moxy
  moxyData: '6404d804-4cb9-11e8-b566-0800200c9a66',
} as const

/**
 * Every service a device might need, so Web Bluetooth grants access up front.
 * (Services not listed in filters or optionalServices throw SecurityError.)
 */
export const ALL_OPTIONAL_SERVICES: string[] = Object.values(SERVICE)
