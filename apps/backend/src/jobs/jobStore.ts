import { randomUUID } from 'node:crypto'
import type { ErrorEvent, ResearchWindow, StreamEvent } from '@re/shared'
import type { ResearchOutcome } from '../pipeline/orchestrator'
import { msg } from '../pipeline/messages'
import type { JobAudit } from '../types'
import { isAbort } from '../util/concurrency'

/**
 * In-memory research jobs. A job runs independently of any connection and
 * writes to an append-only log of JSON lines; the SSE stream and the polling
 * endpoint are two readers of that log, each with its own cursor. A client
 * can therefore reconnect, or switch transport, without losing events.
 *
 * Single process only — the backend service must run as one replica.
 */

export interface Job {
  id: string
  window: ResearchWindow
  createdAt: number
  touchedAt: number
  /** JSON-encoded StreamEvents. */
  lines: string[]
  done: boolean
  error: string | null
  audit: JobAudit | null
  controller: AbortController
  listeners: Set<() => void>
}

export class JobLimitError extends Error {
  constructor(
    message: string,
    readonly code: 'busy' | 'budget',
  ) {
    super(message)
    this.name = 'JobLimitError'
  }
}

export interface JobStoreOptions {
  maxConcurrent: number
  dailyBudget: number
  timeoutMs: number
  /** Finished or abandoned jobs are dropped after this long without a reader. */
  idleEvictMs?: number
}

export type JobRunner = (job: Job, emit: (event: StreamEvent) => void) => Promise<ResearchOutcome>

export class JobStore {
  private readonly jobs = new Map<string, Job>()
  private budgetDay = ''
  private budgetUsed = 0
  private readonly sweeper: NodeJS.Timeout

  constructor(private readonly options: JobStoreOptions) {
    this.sweeper = setInterval(() => this.sweep(), 60_000)
    this.sweeper.unref()
  }

  get activeCount(): number {
    let n = 0
    for (const job of this.jobs.values()) if (!job.done) n += 1
    return n
  }

  get(id: string): Job | undefined {
    const job = this.jobs.get(id)
    if (job) job.touchedAt = Date.now()
    return job
  }

  /** Creates a job and starts it. Throws JobLimitError when the service is busy or over budget. */
  start(window: ResearchWindow, runner: JobRunner): Job {
    if (this.activeCount >= this.options.maxConcurrent) {
      throw new JobLimitError('Trwa już maksymalna liczba równoległych researchy — spróbuj ponownie za kilka minut.', 'busy')
    }
    const today = new Date().toISOString().slice(0, 10)
    if (today !== this.budgetDay) {
      this.budgetDay = today
      this.budgetUsed = 0
    }
    if (this.budgetUsed >= this.options.dailyBudget) {
      throw new JobLimitError('Wyczerpano dzienny limit researchy — spróbuj ponownie jutro.', 'budget')
    }
    this.budgetUsed += 1

    const job: Job = {
      id: randomUUID(),
      window,
      createdAt: Date.now(),
      touchedAt: Date.now(),
      lines: [],
      done: false,
      error: null,
      audit: null,
      controller: new AbortController(),
      listeners: new Set(),
    }
    this.jobs.set(job.id, job)
    void this.run(job, runner)
    return job
  }

  abort(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job || job.done) return false
    this.append(job, msg.aborted())
    job.controller.abort()
    return true
  }

  /** Stops everything — used on shutdown. */
  close(): void {
    clearInterval(this.sweeper)
    for (const job of this.jobs.values()) if (!job.done) job.controller.abort()
  }

  private append(job: Job, event: StreamEvent): void {
    if (job.done) return
    job.lines.push(JSON.stringify(event))
    this.notify(job)
  }

  private finish(job: Job, error: ErrorEvent | null): void {
    if (job.done) return
    if (error) {
      job.lines.push(JSON.stringify(error))
      job.error = error.message
    }
    job.done = true
    job.touchedAt = Date.now()
    this.notify(job)
  }

  private notify(job: Job): void {
    for (const listener of job.listeners) listener()
  }

  private async run(job: Job, runner: JobRunner): Promise<void> {
    const timeout = setTimeout(() => job.controller.abort(new Error('timeout')), this.options.timeoutMs)
    try {
      const outcome = await runner(job, (event) => this.append(job, event))
      job.audit = outcome.audit
      this.append(job, outcome.result)
      this.finish(job, null)
    } catch (err) {
      const timedOut = job.controller.signal.aborted && job.controller.signal.reason instanceof Error && job.controller.signal.reason.message === 'timeout'
      if (timedOut) {
        this.finish(job, {
          type: 'error',
          code: 'timeout',
          message: `Research przekroczył limit czasu (${Math.round(this.options.timeoutMs / 60000)} min) i został przerwany.`,
        })
      } else if (job.controller.signal.aborted || isAbort(err)) {
        this.finish(job, { type: 'error', code: 'aborted', message: 'Research przerwany.' })
      } else {
        const detail = err instanceof Error ? err.message : String(err)
        this.finish(job, { type: 'error', code: 'pipeline_failed', message: `Research zakończył się błędem.\n${detail}\n${new Date().toISOString()}` })
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private sweep(): void {
    const idle = this.options.idleEvictMs ?? 15 * 60_000
    const now = Date.now()
    for (const [id, job] of this.jobs) {
      if (now - job.touchedAt < idle) continue
      if (!job.done) job.controller.abort()
      this.jobs.delete(id)
    }
  }
}
