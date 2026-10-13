/** Minimal promise concurrency limiter (FIFO). */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>

export function createLimiter(concurrency: number): Limiter {
  const max = Math.max(1, Math.floor(concurrency))
  let active = 0
  const queue: Array<() => void> = []

  const next = () => {
    if (active >= max) return
    const run = queue.shift()
    if (run) run()
  }

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active += 1
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            next()
          })
      }
      queue.push(run)
      next()
    })
}

export class AbortedError extends Error {
  constructor() {
    super('Przerwano')
    this.name = 'AbortedError'
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortedError()
}

export function isAbort(err: unknown): boolean {
  return err instanceof AbortedError || (err instanceof Error && (err.name === 'AbortError' || err.name === 'AbortedError'))
}

/** Abort-aware sleep. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AbortedError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
