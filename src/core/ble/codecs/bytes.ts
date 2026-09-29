// Little-endian byte helpers shared by every GATT codec. Reads are
// length-checked, so a truncated notification throws a CodecError that names
// the characteristic and the field instead of reading past the end. Writes
// round to the nearest integer and clamp to the field's range, so an
// out-of-range value saturates rather than wrapping into a wrong one.

/** Thrown when a payload is truncated or malformed, or a value cannot be encoded. */
export class CodecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodecError'
  }
}

/** A DataView over the same memory (no copy for Uint8Array, including Node Buffers). */
export function toDataView(bytes: Uint8Array | ArrayBuffer | readonly number[]): DataView {
  if (bytes instanceof Uint8Array) return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes instanceof ArrayBuffer) return new DataView(bytes)
  return new DataView(Uint8Array.from(bytes).buffer)
}

/** Parses hex such as "44 00 f6 09", "44:00:F6:09" or "0x44,0x00". */
export function fromHex(hex: string): DataView {
  const clean = hex.replace(/0x/gi, '').replace(/[\s:,-]/g, '')
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(clean)) {
    throw new CodecError(`fromHex: "${hex}" is not a whole number of hex bytes`)
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16)
  return toDataView(out)
}

/** Lower-case, space-separated hex ("44 00 f6 09"), for logs and error messages. */
export function toHex(data: DataView | Uint8Array): string {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return Array.from(view, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

/** Rounds to the nearest integer and clamps into [min, max]. Throws on NaN or ±Infinity. */
export function clampInt(value: number, min: number, max: number, field: string): number {
  if (!Number.isFinite(value)) throw new CodecError(`${field}: cannot encode ${value}`)
  return Math.min(max, Math.max(min, Math.round(value))) + 0 // + 0 turns -0 into 0
}

/** Rounds and wraps modulo `modulus`, for rolling counters (revolutions, event times). */
export function wrapInt(value: number, modulus: number, field: string): number {
  if (!Number.isFinite(value)) throw new CodecError(`${field}: cannot encode ${value}`)
  return (((Math.round(value) % modulus) + modulus) % modulus) + 0
}

/** Rounds to `decimals` places, to strip binary noise from unit conversions. */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f + 0
}

/** Sequential little-endian reader that throws CodecError instead of overrunning. */
export class ByteReader {
  private pos = 0

  constructor(
    private readonly dv: DataView,
    /** Characteristic name, used in error messages. */
    private readonly what: string,
  ) {}

  get offset(): number {
    return this.pos
  }
  get remaining(): number {
    return this.dv.byteLength - this.pos
  }

  uint8(field: string): number {
    return this.dv.getUint8(this.take(1, field))
  }
  sint8(field: string): number {
    return this.dv.getInt8(this.take(1, field))
  }
  uint16(field: string): number {
    return this.dv.getUint16(this.take(2, field), true)
  }
  sint16(field: string): number {
    return this.dv.getInt16(this.take(2, field), true)
  }
  uint24(field: string): number {
    const at = this.take(3, field)
    return this.dv.getUint8(at) | (this.dv.getUint16(at + 1, true) << 8)
  }
  uint32(field: string): number {
    return this.dv.getUint32(this.take(4, field), true)
  }
  /** Copies the next `n` bytes. */
  bytes(n: number, field: string): Uint8Array {
    const at = this.take(n, field)
    return new Uint8Array(this.dv.buffer, this.dv.byteOffset + at, n).slice()
  }
  /** Copies every byte not read yet (possibly none). */
  rest(): Uint8Array {
    return this.bytes(this.remaining, 'rest')
  }
  /** A CodecError prefixed with the characteristic name, for the caller to throw. */
  invalid(message: string): CodecError {
    return new CodecError(`${this.what}: ${message}`)
  }

  private take(n: number, field: string): number {
    const at = this.pos
    const len = this.dv.byteLength
    if (at + n > len) {
      throw new CodecError(
        `${this.what}: truncated, ${field} needs ${n} byte${n === 1 ? '' : 's'} at offset ${at} ` +
          `but the payload is ${len} byte${len === 1 ? '' : 's'}`,
      )
    }
    this.pos = at + n
    return at
  }
}

/** Little-endian writer. Integer writes round and clamp; counter() wraps instead. */
export class ByteWriter {
  private readonly out: number[] = []

  uint8(value: number, field = 'value'): this {
    return this.put(clampInt(value, 0, 0xff, field), 1)
  }
  sint8(value: number, field = 'value'): this {
    return this.put(clampInt(value, -0x80, 0x7f, field), 1)
  }
  uint16(value: number, field = 'value'): this {
    return this.put(clampInt(value, 0, 0xffff, field), 2)
  }
  sint16(value: number, field = 'value'): this {
    return this.put(clampInt(value, -0x8000, 0x7fff, field), 2)
  }
  uint24(value: number, field = 'value'): this {
    return this.put(clampInt(value, 0, 0xffffff, field), 3)
  }
  uint32(value: number, field = 'value'): this {
    return this.put(clampInt(value, 0, 0xffffffff, field), 4)
  }
  /** A rolling counter of `size` bytes, written modulo 2^(8·size). */
  counter(value: number, size: 2 | 4, field = 'value'): this {
    return this.put(wrapInt(value, 2 ** (8 * size), field), size)
  }
  raw(bytes: ArrayLike<number>): this {
    for (let i = 0; i < bytes.length; i++) this.out.push((bytes[i] ?? 0) & 0xff)
    return this
  }
  toBytes(): Uint8Array {
    return Uint8Array.from(this.out)
  }

  private put(int: number, size: number): this {
    const unsigned = int < 0 ? int + 2 ** (8 * size) : int
    for (let i = 0; i < size; i++) this.out.push((unsigned >>> (8 * i)) & 0xff)
    return this
  }
}
