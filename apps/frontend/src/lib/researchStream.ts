/**
 * Stream client for the research backend.
 *
 * The backend runs the research as a job and keeps an append-only log of
 * events. This client starts the job, then reads the log:
 *  1. live, as Server-Sent Events over fetch + ReadableStream (EventSource
 *     cannot send the Authorization header),
 *  2. by short polling from the same cursor, when the live stream does not
 *     deliver — corporate proxies and VPNs often buffer long-lived responses.
 * The switch is automatic and loses no events.
 */
import { api } from '../config'
import { authHeaders } from './auth'

/** Flat meta the backend attaches to progress events (snake_case → camelCase). */
export interface ResearchEventMeta {
  completed?: number
  total?: number
  doneLabels?: string
  dealsTotal?: number
  deepenTotal?: number
  deal?: string
  dealIndex?: number
  dealTotal?: number
  sources?: number
}

export interface ResearchEvent {
  phase: string
  message: string
  /** Raw backend phase_id (unvalidated — App maps it via PHASE_INDEX). */
  phaseId?: string
  /** Progress 0..1 inside the phase (currently deepening only). */
  progress?: number
  meta?: ResearchEventMeta
}

interface StartOptions {
  range: string
  /** Plug Opoint into this run (opt-in; the backend refuses it when Opoint is switched off). */
  useOpoint?: boolean
  onEvent: (event: ResearchEvent) => void
  /** Fired once with the final payload (array of raw transaction records). */
  onComplete: (rawTransactions: unknown[]) => void
  onError: (detail: string) => void
  /** The backend rejected the access password — the app should ask for it again. */
  onAuthError: () => void
  /**
   * Fired once when no byte has arrived within STALL_AFTER_MS of the request
   * starting — the tell-tale of a corporate proxy buffering the connection.
   * Cleared automatically (onStall(false)) as soon as data starts flowing.
   */
  onStall?: (stalled: boolean) => void
}

/** No data within this window ⇒ almost certainly a buffering proxy/VPN. */
const STALL_AFTER_MS = 15000
const START_TIMEOUT_MS = 20000
/** The stream opens with a comment line, so silence this long means it is being buffered. */
const STREAM_FIRST_BYTE_MS = 6000
/** The backend sends a heartbeat every 10 s; this much silence means the stream is dead. */
const STREAM_SILENCE_MS = 30000
const POLL_INTERVAL_MS = 800
/** Consecutive failed polls tolerated before giving up (transient network blips). */
const MAX_POLL_FAILURES = 5

/** Remembers, for this browser tab, that the network cannot carry the live stream. */
const TRANSPORT_KEY = 'dentons-re-transport'

export interface ResearchStreamHandle {
  abort: () => void
}

function extractFinalArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.transactions)) return obj.transactions
  }
  return null
}

function preferPolling(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('transport') === 'poll') return true
    return sessionStorage.getItem(TRANSPORT_KEY) === 'poll'
  } catch {
    return false
  }
}

function rememberPolling(): void {
  try {
    sessionStorage.setItem(TRANSPORT_KEY, 'poll')
  } catch {
    /* not essential */
  }
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (data && typeof data === 'object' && typeof (data as Record<string, unknown>).error === 'string') {
      return (data as { error: string }).error
    }
  } catch {
    /* not JSON */
  }
  return `HTTP ${response.status} ${response.statusText}`.trim()
}

export function startResearchStream({ range, useOpoint = false, onEvent, onComplete, onError, onAuthError, onStall }: StartOptions): ResearchStreamHandle {
  const controller = new AbortController()
  let finished = false // completion or error already delivered
  let aborted = false
  let lastRaw = ''
  let jobId: string | null = null
  /** Number of events consumed so far = position in the backend's job log. */
  let cursor = 0

  const fail = (detail: string) => {
    if (finished || aborted) return
    finished = true
    onError(detail)
  }

  const complete = (rows: unknown[]) => {
    if (finished || aborted) return
    finished = true
    onComplete(rows)
    controller.abort() // we have everything — close the connection gracefully
  }

  const authFailed = () => {
    if (finished || aborted) return
    finished = true
    controller.abort()
    onAuthError()
  }

  /** Handles one decoded JSON value from the stream. */
  const handleValue = (value: unknown) => {
    if (finished) return
    if (value && typeof value === 'object' && (value as Record<string, unknown>).type === 'error') {
      const message = (value as Record<string, unknown>).message
      fail(`${typeof message === 'string' && message ? message : 'Backend zgłosił błąd'}\n${new Date().toISOString()}`)
      return
    }
    const finalRows = extractFinalArray(value)
    if (finalRows) {
      complete(finalRows)
      return
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const message = typeof obj.message === 'string' ? obj.message : ''
      const phase = typeof obj.phase === 'string' ? obj.phase : ''
      const phaseId = typeof obj.phase_id === 'string' ? obj.phase_id : undefined
      const num = (v: unknown): number | undefined =>
        typeof v === 'number' && Number.isFinite(v) ? v : undefined
      const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
      const rawProgress = num(obj.progress)
      const meta: ResearchEventMeta = {
        completed: num(obj.completed),
        total: num(obj.total),
        doneLabels: str(obj.done_labels),
        dealsTotal: num(obj.deals_total),
        deepenTotal: num(obj.deepen_total),
        deal: str(obj.deal),
        dealIndex: num(obj.deal_index),
        dealTotal: num(obj.deal_total),
        sources: num(obj.sources),
      }
      const hasMeta = Object.values(meta).some((v) => v !== undefined)
      if (message || phase || phaseId) {
        onEvent({
          phase,
          message,
          phaseId,
          progress: rawProgress === undefined ? undefined : Math.min(1, Math.max(0, rawProgress)),
          meta: hasMeta ? meta : undefined,
        })
      }
    }
  }

  /** Feeds one event payload (a JSON document) and advances the cursor. */
  const handlePayload = (payload: string) => {
    const trimmed = payload.trim()
    if (!trimmed) return
    cursor += 1
    lastRaw = trimmed
    try {
      handleValue(JSON.parse(trimmed))
    } catch {
      /* not JSON — the backend never sends such a line; skip it but keep the cursor in step */
    }
  }

  /** Feeds one line of the SSE stream. Only `data:` lines carry events. */
  const handleStreamLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return // comments (heartbeats), `id:` and `event:` lines
    handlePayload(trimmed.slice(5))
  }

  /** Watchdog: if no byte arrives within STALL_AFTER_MS the connection is almost
   *  certainly being buffered by a proxy/VPN — raise the stall flag so the UI
   *  can tell the user. */
  let gotData = false
  let stallTimer: number | null = null
  const clearStall = () => {
    if (stallTimer !== null) {
      window.clearTimeout(stallTimer)
      stallTimer = null
    }
  }
  const armStall = () => {
    stallTimer = window.setTimeout(() => {
      if (!finished && !aborted && !gotData) onStall?.(true)
    }, STALL_AFTER_MS)
  }
  /** First event from the backend clears the warning and disarms the watchdog. */
  const markData = () => {
    if (gotData) return
    gotData = true
    clearStall()
    onStall?.(false)
  }
  armStall()

  /** Abort-aware pause between polls. */
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, ms)
      controller.signal.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })

  /** POST /api/research/start → job id. Reports its own failures; null means "stop". */
  const startJob = async (): Promise<string | null> => {
    const timer = window.setTimeout(() => controller.abort(), START_TIMEOUT_MS)
    try {
      const response = await fetch(api.start, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ range, useOpoint }),
        signal: controller.signal,
      })
      if (response.status === 401) {
        authFailed()
        return null
      }
      if (!response.ok) {
        fail(`${await errorDetail(response)}\nPOST ${api.start}\nHTTP ${response.status} · ${new Date().toISOString()}`)
        return null
      }
      const data: unknown = await response.json()
      const id = data && typeof data === 'object' ? (data as Record<string, unknown>).jobId : undefined
      if (typeof id !== 'string') {
        fail(`Backend nie zwrócił identyfikatora researchu\nPOST ${api.start}\n${new Date().toISOString()}`)
        return null
      }
      return id
    } catch (err) {
      if (aborted) return null
      const timedOut = controller.signal.aborted
      const reason = timedOut ? 'przekroczono czas oczekiwania na odpowiedź' : err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      fail(`Nie udało się połączyć z backendem (${reason})\nPOST ${api.start}\n${new Date().toISOString()}`)
      return null
    } finally {
      window.clearTimeout(timer)
    }
  }

  /**
   * Reads the live stream. Resolves true when the run is over (result, error
   * or abort) and false when the stream did not deliver and polling should
   * take over from the current cursor.
   */
  const readStream = async (id: string): Promise<boolean> => {
    const streamController = new AbortController()
    const onOuterAbort = () => streamController.abort()
    controller.signal.addEventListener('abort', onOuterAbort, { once: true })
    let silenceTimer: number | null = null
    const watch = (ms: number) => {
      if (silenceTimer !== null) window.clearTimeout(silenceTimer)
      silenceTimer = window.setTimeout(() => streamController.abort(), ms)
    }
    try {
      watch(STREAM_FIRST_BYTE_MS)
      const response = await fetch(api.stream(id, cursor), {
        headers: { Accept: 'text/event-stream', ...authHeaders() },
        signal: streamController.signal,
        cache: 'no-store',
      })
      if (response.status === 401) {
        authFailed()
        return true
      }
      if (!response.ok || !response.body) return false

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.length > 0) watch(STREAM_SILENCE_MS)
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex)
          buffer = buffer.slice(newlineIndex + 1)
          if (line.trim().startsWith('data:')) markData()
          handleStreamLine(line)
          if (finished) return true
          newlineIndex = buffer.indexOf('\n')
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) handleStreamLine(buffer)
      // the server closed the stream: either we are done, or polling will find out why
      return finished
    } catch {
      return finished || aborted
    } finally {
      if (silenceTimer !== null) window.clearTimeout(silenceTimer)
      controller.signal.removeEventListener('abort', onOuterAbort)
    }
  }

  /** Short polls from the current cursor until the job ends. */
  const poll = async (id: string) => {
    let failures = 0
    while (!finished && !aborted && !controller.signal.aborted) {
      try {
        const response = await fetch(api.poll(id, cursor), {
          headers: authHeaders(),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (response.status === 401) {
          authFailed()
          return
        }
        if (response.status === 404) {
          fail(`Backend nie zna już tego researchu (restart usługi?)\nGET ${api.poll(id, cursor)}\n${new Date().toISOString()}`)
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as { lines?: unknown; done?: unknown; error?: unknown }
        failures = 0
        const lines = Array.isArray(data.lines)
          ? data.lines.filter((l): l is string => typeof l === 'string')
          : []
        if (lines.length > 0) {
          markData()
          for (const line of lines) {
            handlePayload(line)
            if (finished) return
          }
        }
        if (data.done) {
          fail(
            typeof data.error === 'string' && data.error
              ? `${data.error}\n${new Date().toISOString()}`
              : `Strumień zakończył się bez finalnych danych\nostatni odebrany fragment: ${lastRaw.slice(0, 200) || '(brak)'}\n${new Date().toISOString()}`,
          )
          return
        }
      } catch (err) {
        if (aborted || controller.signal.aborted) return
        failures += 1
        if (failures >= MAX_POLL_FAILURES) {
          const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
          fail(`Utracono połączenie z backendem (${failures} nieudanych prób): ${reason}\nGET ${api.poll(id, cursor)}\n${new Date().toISOString()}`)
          return
        }
      }
      await sleep(POLL_INTERVAL_MS)
    }
  }

  ;(async () => {
    try {
      jobId = await startJob()
      if (!jobId || finished || aborted) return
      onEvent({ phase: '', message: `Research uruchomiony (zadanie ${jobId.slice(0, 8)}) — otwieram strumień na żywo...` })

      if (!preferPolling()) {
        const over = await readStream(jobId)
        if (over || finished || aborted) return
        rememberPolling()
        onEvent({ phase: '', message: 'Strumień na żywo niedostępny — przełączam na tryb odpytywania...' })
      }
      await poll(jobId)
    } finally {
      clearStall()
    }
  })()

  return {
    abort: () => {
      aborted = true
      clearStall()
      controller.abort()
      // stop the research on the server too — it costs API credits
      if (jobId) {
        void fetch(api.abort, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ id: jobId }),
          keepalive: true,
        }).catch(() => {})
      }
    },
  }
}
