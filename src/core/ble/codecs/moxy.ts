// Moxy muscle oxygen monitor, characteristic 6404d804-4cb9-11e8-b566-0800200c9a66
// (service 6404d801-...).
//
// UNOFFICIAL: Moxy has not published this layout; it is community-documented
// and could change with firmware. Four uint16 values:
//   count           measurement counter
//   SmO2            current muscle oxygen saturation, 0.1 %
//   previous SmO2   the reading before it, 0.1 %
//   tHb             total haemoglobin, 0.01 g/dL

import { ByteReader, ByteWriter } from './bytes'

export interface MoxyMeasurement {
  count: number
  smo2Pct: number
  prevSmo2Pct: number
  thbGdl: number
}

export function parseMoxy(dv: DataView): MoxyMeasurement {
  const r = new ByteReader(dv, 'Moxy SmO2')
  return {
    count: r.uint16('count'),
    smo2Pct: r.uint16('SmO2') / 10,
    prevSmo2Pct: r.uint16('previous SmO2') / 10,
    thbGdl: r.uint16('tHb') / 100,
  }
}

export function encodeMoxy(m: MoxyMeasurement): Uint8Array {
  return new ByteWriter()
    .counter(m.count, 2, 'count')
    .uint16(m.smo2Pct * 10, 'smo2Pct')
    .uint16(m.prevSmo2Pct * 10, 'prevSmo2Pct')
    .uint16(m.thbGdl * 100, 'thbGdl')
    .toBytes()
}
