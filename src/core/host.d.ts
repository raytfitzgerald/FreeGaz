// The only host APIs src/core may rely on. Every one of them exists in Node,
// in Chromium renderers and in workers, so core code runs unchanged in all
// three. This file is included ONLY by tsconfig.core.json; the web and node
// configs get the real DOM/Node declarations instead.

declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(handle: unknown): void
declare function setInterval(handler: () => void, timeout?: number): unknown
declare function clearInterval(handle: unknown): void
declare function queueMicrotask(callback: () => void): void
declare function structuredClone<T>(value: T): T

declare const console: {
  log(...data: unknown[]): void
  info(...data: unknown[]): void
  warn(...data: unknown[]): void
  error(...data: unknown[]): void
  debug(...data: unknown[]): void
}

declare const performance: { now(): number }

declare class TextEncoder {
  encode(input?: string): Uint8Array
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean })
  decode(input?: ArrayBufferView | ArrayBuffer): string
}

interface AbortSignal {
  readonly aborted: boolean
  readonly reason: unknown
  throwIfAborted(): void
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}

declare class AbortController {
  readonly signal: AbortSignal
  abort(reason?: unknown): void
}
