import type { ProgressEvent, ResearchWindow } from '@re/shared'
import type { LlmClient } from '../clients/llm'
import type { OpointClient } from '../clients/opoint'
import type { TavilyClient } from '../clients/tavily'
import type { DomainLists } from '../config/domains'
import type { AuditEntry } from '../types'

/** Tunables of one run — a subset of AppConfig, so tests can pass plain values. */
export interface PipelineSettings {
  maxDiscoveryQueries: number
  maxArticlesForExtraction: number
  deepenLimit: number
  maxQueriesPerDeal: number
  maxNewSourcesPerDeal: number
  deepenConcurrency: number
  strictWindow: boolean
  /** A deal whose oldest report predates the window end by more than this is dropped. */
  maxDealAgeDays: number
}

/** Everything a pipeline stage needs. Clients are injected, so mock mode and tests share the real pipeline. */
export interface PipelineContext {
  window: ResearchWindow
  settings: PipelineSettings
  lists: DomainLists
  /** Null when Opoint is not configured. */
  opoint: OpointClient | null
  tavily: TavilyClient
  llm: LlmClient
  emit: (event: ProgressEvent) => void
  signal: AbortSignal
  audit: AuditEntry[]
}
