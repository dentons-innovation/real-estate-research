import { isAbort, sleep, throwIfAborted } from '../util/concurrency'

/**
 * fetch wrapper for provider calls: per-attempt timeout, retries with jittered
 * backoff on network errors / 429 / 5xx, Retry-After support, caller abort.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly provider: string,
    readonly bodySnippet: string,
  ) {
    super(`${provider}: HTTP ${status}${bodySnippet ? ` — ${bodySnippet}` : ''}`)
    this.name = 'HttpError'
  }
}

export interface RequestOptions {
  provider: string
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  timeoutMs?: number
  retries?: number
  signal?: AbortSignal
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])

export async function requestJson<T = unknown>(options: RequestOptions): Promise<T> {
  const { provider, url, method = 'POST', headers = {}, body, timeoutMs = 30000, retries = 2, signal } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    throwIfAborted(signal)
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combined,
      })
      if (response.ok) return (await response.json()) as T

      const snippet = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
      const error = new HttpError(response.status, provider, snippet)
      if (!RETRYABLE.has(response.status) || attempt === retries) throw error
      lastError = error
      const retryAfter = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20000) : backoff(attempt)
      await sleep(wait, signal)
    } catch (err) {
      if (signal?.aborted) throw err
      if (err instanceof HttpError) throw err
      // timeout or network failure
      lastError = err
      if (attempt === retries) break
      if (isAbort(err) && !timeout.aborted) throw err
      await sleep(backoff(attempt), signal)
    }
  }
  const reason = lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError)
  throw new Error(`${provider}: żądanie nie powiodło się (${reason})`)
}

function backoff(attempt: number): number {
  return Math.min(8000, 600 * 2 ** attempt) + Math.floor(Math.random() * 300)
}
