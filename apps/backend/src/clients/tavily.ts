import type { AppConfig } from '../config/env'
import { dateFromUrl, toIsoDay } from '../deals/dates'
import { createLimiter } from '../util/concurrency'
import { requestJson } from './http'

export interface TavilySearchParams {
  query: string
  topic?: 'general' | 'news'
  /** Inclusive, YYYY-MM-DD. */
  startDate?: string
  endDate?: string
  includeDomains?: string[]
  excludeDomains?: string[]
  maxResults?: number
  /** Ask for the full page text with the results. */
  rawContent?: boolean
  /** Who is asking. Ignored by the real client; the mock answers discovery and deepening differently. */
  purpose?: 'discovery' | 'deepening'
  signal?: AbortSignal
}

export interface TavilyResult {
  url: string
  title: string
  /** Short snippet. */
  content: string
  /** Full page text, when requested and available. */
  rawContent: string | null
  publishedAt: string | null
  score: number
}

export interface TavilyExtractResult {
  url: string
  rawContent: string
}

export interface TavilyClient {
  search(params: TavilySearchParams): Promise<TavilyResult[]>
  extract(urls: string[], signal?: AbortSignal): Promise<TavilyExtractResult[]>
}

/** Tavily rejects queries longer than 400 characters. */
export const TAVILY_MAX_QUERY_CHARS = 390

interface RawSearchResponse {
  results?: Array<{
    url?: string
    title?: string
    content?: string
    raw_content?: string | null
    published_date?: string
    score?: number
  }>
}

interface RawExtractResponse {
  results?: Array<{ url?: string; raw_content?: string }>
}

export function createTavilyClient(config: AppConfig): TavilyClient {
  const limit = createLimiter(config.TAVILY_CONCURRENCY)
  const base = config.TAVILY_BASE_URL.replace(/\/+$/, '')
  const headers = { Authorization: `Bearer ${config.TAVILY_API_KEY}` }

  return {
    search: (params) =>
      limit(async () => {
        const topic = params.topic ?? 'general'
        const body: Record<string, unknown> = {
          query: params.query.slice(0, TAVILY_MAX_QUERY_CHARS),
          topic,
          search_depth: config.TAVILY_SEARCH_DEPTH,
          max_results: Math.min(params.maxResults ?? 10, 20),
          include_raw_content: params.rawContent ? 'markdown' : false,
          include_answer: false,
        }
        if (params.startDate) body.start_date = params.startDate
        if (params.endDate) body.end_date = params.endDate
        if (params.includeDomains?.length) body.include_domains = params.includeDomains
        if (params.excludeDomains?.length) body.exclude_domains = params.excludeDomains
        // country boost is only available for the general topic
        if (topic === 'general') body.country = 'poland'

        const data = await requestJson<RawSearchResponse>({
          provider: 'Tavily',
          url: `${base}/search`,
          headers,
          body,
          timeoutMs: 45000,
          signal: params.signal,
        })
        return (data.results ?? [])
          .filter((r): r is typeof r & { url: string } => typeof r.url === 'string' && r.url.length > 0)
          .map((r) => ({
            url: r.url,
            title: r.title ?? '',
            content: r.content ?? '',
            rawContent: typeof r.raw_content === 'string' && r.raw_content.trim() ? r.raw_content : null,
            // trade press rarely comes with a date from Tavily, but most of it dates its URLs
            publishedAt: toIsoDay(r.published_date) ?? dateFromUrl(r.url),
            score: typeof r.score === 'number' ? r.score : 0,
          }))
      }),

    extract: (urls, signal) =>
      limit(async () => {
        if (urls.length === 0) return []
        const data = await requestJson<RawExtractResponse>({
          provider: 'Tavily',
          url: `${base}/extract`,
          headers,
          body: { urls: urls.slice(0, 20), extract_depth: 'basic', format: 'markdown' },
          timeoutMs: 60000,
          signal,
        })
        return (data.results ?? [])
          .filter((r): r is { url: string; raw_content: string } => typeof r.url === 'string' && typeof r.raw_content === 'string')
          .map((r) => ({ url: r.url, rawContent: r.raw_content }))
      }),
  }
}
