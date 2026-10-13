import type { TransactionRecord } from './transaction'

/**
 * Stream protocol between the backend and the frontend mission timeline.
 * Every event is one JSON object per line (SSE `data:` line or a poll `lines` entry).
 */

/** phase_id values understood by the frontend timeline, in order. */
export const BACKEND_PHASE_IDS = [
  'init',
  'research_launch',
  'research_1',
  'research_2',
  'research_3',
  'dedup',
  'gap_analysis',
  'deepening',
  'compile',
  'done',
] as const

export type BackendPhaseId = (typeof BACKEND_PHASE_IDS)[number]

/**
 * Progress event. Field names are snake_case for compatibility with the
 * existing frontend parser. Must never carry a `transactions` or `content`
 * key — the parser treats those as the final payload / an envelope.
 */
export interface ProgressEvent {
  /** Absent on informational lines that should not move the timeline. */
  phase_id?: BackendPhaseId
  /** Polish phase tag shown in the log console. */
  phase: string
  /** Polish log line. */
  message: string
  /** 0..1 inside the phase (deepening only). */
  progress?: number
  completed?: number
  total?: number
  done_labels?: string
  deals_total?: number
  deepen_total?: number
  deal?: string
  deal_index?: number
  deal_total?: number
  sources?: number
}

export interface ResearchWindow {
  /** Inclusive, YYYY-MM-DD. */
  from: string
  /** Inclusive, YYYY-MM-DD. */
  to: string
  days: number
}

export interface ResultMeta {
  window: ResearchWindow
  opoint_used: boolean
  articles_scanned: number
  deals_dropped: number
}

export interface ResultEvent {
  type: 'result'
  transactions: TransactionRecord[]
  meta: ResultMeta
}

export interface ErrorEvent {
  type: 'error'
  /** Polish, user-facing. May be multiline (technical detail after the first line). */
  message: string
  code: string
}

export type StreamEvent = ProgressEvent | ResultEvent | ErrorEvent

export interface StartRequest {
  /** e.g. "30d". Ignored when from/to are given. */
  range?: string
  from?: string
  to?: string
  /**
   * Plug Opoint (media monitoring) into this run. Opt-in: absent or false means
   * the run discovers articles with Tavily alone. The backend rejects `true`
   * with `opoint_unavailable` when Opoint is disabled or not configured.
   */
  useOpoint?: boolean
}

/**
 * Whether Opoint can be plugged into a run.
 *   available      — token present and OPOINT_ENABLED=true
 *   disabled       — switched off by OPOINT_ENABLED=false (e.g. token budget)
 *   not_configured — no token
 */
export type OpointStatus = 'available' | 'disabled' | 'not_configured'

export interface HealthResponse {
  ok: boolean
  mock: boolean
  opoint: OpointStatus
  active_jobs: number
}

export interface StartResponse {
  jobId: string
  window: ResearchWindow
}

export interface PollResponse {
  /** JSON-encoded StreamEvents after the requested cursor. */
  lines: string[]
  done: boolean
  error: string | null
}

export const API_PATHS = {
  health: '/healthz',
  authCheck: '/api/auth/check',
  start: '/api/research/start',
  stream: '/api/research/stream',
  poll: '/api/research/poll',
  abort: '/api/research/abort',
  audit: '/api/research/audit',
} as const
