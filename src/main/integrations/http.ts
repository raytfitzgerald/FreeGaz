// Small fetch wrapper for third-party APIs: timeouts, typed errors, and
// Retry-After-aware backoff on 429/5xx.

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly retryAfterS: number | null = null,
  ) {
    super(message)
    this.name = 'HttpError'
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 0
  }
}

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: BodyInit
  timeoutMs?: number
  signal?: AbortSignal
}

export async function requestJson<T>(url: string, opts: RequestOpts = {}): Promise<T> {
  const text = await requestText(url, opts)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(`Invalid JSON from ${new URL(url).host}`, 0, text)
  }
}

export async function requestText(url: string, opts: RequestOpts = {}): Promise<string> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(url, { method: opts.method ?? 'GET', headers: opts.headers, body: opts.body, signal })
  } catch (e) {
    throw new HttpError(`Network error calling ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`, 0, '')
  }
  const body = await res.text()
  if (!res.ok) {
    const ra = res.headers.get('retry-after')
    throw new HttpError(`${new URL(url).host} returned ${res.status}`, res.status, body.slice(0, 2000), ra ? Number(ra) || null : null)
  }
  return body
}

/** Exponential backoff with jitter-free determinism (tests) and Retry-After support. */
export function backoffMs(attempt: number, retryAfterS: number | null = null): number {
  if (retryAfterS !== null) return Math.max(1000, retryAfterS * 1000)
  return Math.min(15 * 60_000, 5000 * 2 ** attempt)
}
