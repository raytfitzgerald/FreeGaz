// Fitness Machine Service (0x1826) codecs, split by characteristic:
//   ftms-bike-data  Indoor Bike Data (0x2AD2) + split-record assembler
//   ftms-features   Fitness Machine Feature (0x2ACC), Supported Power/Resistance Range (0x2AD8/0x2AD6)
//   ftms-control    Control Point (0x2AD9) commands and responses
//   ftms-status     Fitness Machine Status (0x2ADA), Training Status (0x2AD3)
//   ftms-simulation (internal) the simulation parameter array both of the last two use

export * from './ftms-bike-data'
export * from './ftms-features'
export * from './ftms-control'
export * from './ftms-status'
export type { SimulationParams } from './ftms-simulation'
