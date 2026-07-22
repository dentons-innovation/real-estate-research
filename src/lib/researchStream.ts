/**
 * SSE/stream client for the n8n research backend.
 *
 * Uses fetch + ReadableStream (instead of EventSource) so we can POST the
 * search parameters and tolerate every framing n8n may produce:
 *  - proper SSE ("data: {...}\n\n", ": comments", "event:" lines),
 *  - NDJSON (one JSON object per line),
 *  - n8n streaming envelopes ({"type":"item","content":{...}}).
 */

/** Płaskie meta dołączane przez backend do eventów postępu (snake_case → camelCase). */
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
  /** Surowe phase_id z backendu (bez walidacji — mapowanie robi App przez PHASE_INDEX). */
  phaseId?: string
  /** Postęp 0..1 wewnątrz fazy (obecnie tylko deepening). */
  progress?: number
  meta?: ResearchEventMeta
}

interface StartOptions {
  url: string
  range: string
  /** Identyfikator przebiegu — backend flaguje nim żądania zatrzymania. */
  runId?: string
  onEvent: (event: ResearchEvent) => void
  /** Fired once with the final payload (array of raw transaction records). */
  onComplete: (rawTransactions: unknown[]) => void
  onError: (detail: string) => void
}

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

export function startResearchStream({ url, range, runId, onEvent, onComplete, onError }: StartOptions): ResearchStreamHandle {
  const controller = new AbortController()
  let finished = false // completion or error already delivered
  let aborted = false
  let lastRaw = ''

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

  /** Handles one decoded JSON value from the stream. */
  const handleValue = (value: unknown) => {
    if (finished) return
    // unwrap n8n streaming envelopes: {"type":"item","content":...}
    if (value && typeof value === 'object' && 'content' in (value as Record<string, unknown>)) {
      const { content } = value as { content: unknown }
      if (typeof content === 'string') {
        try {
          handleValue(JSON.parse(content))
        } catch {
          /* plain-text chunk from n8n — surface it as a log line */
          if (content.trim()) onEvent({ phase: '', message: content.trim() })
        }
        return
      }
      if (content && typeof content === 'object') {
        handleValue(content)
        return
      }
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

  /** Feeds one line/payload of text; tries SSE "data:" framing first, then bare JSON. */
  const handleChunkText = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:') || trimmed.startsWith('id:')) return
    const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    if (!payload || payload === '[DONE]') return
    lastRaw = payload
    try {
      handleValue(JSON.parse(payload))
    } catch {
      /* Not JSON (partial frame or prose) — ignore; buffer handles partials. */
    }
  }

  ;(async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range, run_id: runId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        fail(`HTTP ${response.status} ${response.statusText}\n${url}\n${new Date().toISOString()}`)
        return
      }
      if (!response.body) {
        fail(`Brak strumienia w odpowiedzi (response.body === null)\n${url}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // process complete lines; SSE events end with \n\n but a per-line pass
        // covers both SSE and NDJSON (JSON payloads are single-line)
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          handleChunkText(buffer.slice(0, newlineIndex))
          buffer = buffer.slice(newlineIndex + 1)
          newlineIndex = buffer.indexOf('\n')
          if (finished) return
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) handleChunkText(buffer)

      if (!finished) {
        fail(
          `Strumień zakończył się bez finalnych danych\n${url}\nostatni odebrany fragment: ${lastRaw.slice(0, 200) || '(brak)'}\n${new Date().toISOString()}`,
        )
      }
    } catch (err) {
      if (aborted || controller.signal.aborted) return
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      fail(`${reason}\nPOST ${url}\n${new Date().toISOString()}`)
    }
  })()

  return {
    abort: () => {
      aborted = true
      controller.abort()
    },
  }
}
