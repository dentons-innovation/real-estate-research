import type { ResearchWindow } from '@re/shared'
import type { ArticleExtraction } from '../../extraction/schema'
import type { LaneId } from '../../types'
import { sleep } from '../../util/concurrency'
import { fold } from '../../verify/normalize'
import type { LlmClient, StructuredRequest } from '../llm'
import type { OpointClient } from '../opoint'
import type { TavilyClient, TavilyResult } from '../tavily'
import { buildFixtures, type Fixture } from './fixtures'

/**
 * Keyless clients for MOCK_MODE and tests. The real pipeline runs on top of
 * them — only the network is replaced.
 */

export interface MockOptions {
  /** Overrides the model's answer for a URL — used by tests to inject bad answers. */
  extractionFor?: (url: string, fixture: Fixture | undefined) => ArticleExtraction | undefined
  failOpoint?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

function laneOfQuery(query: string, includeDomains: string[] | undefined): LaneId {
  const q = fold(query)
  if (/doradza|advised|kancelari/.test(q)) return 'lawfirms'
  if (/finansowan|refinans|kredyt|financing|refinancing|facility|joint venture/.test(q)) return 'financing'
  return includeDomains && includeDomains.some((d) => /law|legal/.test(d)) ? 'lawfirms' : 'sales'
}

export function createMockClients(speed = 1, options: MockOptions = {}) {
  const wait = (ms: number, signal?: AbortSignal) => (speed > 0 ? sleep(ms * speed, signal) : Promise.resolve())
  let fixtures: Fixture[] = buildFixtures(today())

  const toResult = (f: Fixture): TavilyResult => ({
    url: f.url,
    title: f.title,
    content: f.text.slice(0, 200),
    rawContent: f.text,
    publishedAt: f.publishedAt,
    score: 0.9,
  })

  const opoint: OpointClient = {
    async fetchArticles(window: ResearchWindow, signal) {
      fixtures = buildFixtures(window.to)
      await wait(1200, signal)
      if (options.failOpoint) throw new Error('Opoint: HTTP 503 (mock)')
      return {
        mode: 'search_profile',
        warnings: [],
        articles: fixtures.filter((f) => f.via === 'opoint').map((f) => ({ url: f.url, title: f.title, text: f.text, publishedAt: f.publishedAt, language: 'pl' })),
      }
    },
  }

  const tavily: TavilyClient = {
    async search(params) {
      if (params.endDate) fixtures = buildFixtures(params.endDate)
      await wait(500 + Math.random() * 400, params.signal)
      const q = fold(params.query)
      // deepening queries name the deal; discovery queries name a market segment
      if (params.purpose === 'deepening') {
        return fixtures.filter((f) => f.via === 'deepening' && f.keywords?.some((k) => q.includes(fold(k)))).map(toResult)
      }
      const lane = laneOfQuery(params.query, params.includeDomains)
      // every query of a lane finds the lane's pages; the pipeline removes the repeats
      return fixtures.filter((f) => f.via === lane).map(toResult)
    },
    async extract(urls, signal) {
      await wait(600, signal)
      return fixtures.filter((f) => urls.includes(f.url)).map((f) => ({ url: f.url, rawContent: f.text }))
    },
  }

  const llm: LlmClient = {
    async structured<T>(request: StructuredRequest<T>): Promise<T> {
      await wait(700 + Math.random() * 900, request.signal)
      if (request.name === 'deal_descriptions') {
        const deals = JSON.parse(request.user.replace(/^DEALS:\s*/, '')) as Array<{ deal_id: number; asset: string; buyer: Array<{ value: string }>; transaction_type: string }>
        const answer = {
          deals: deals.map((d) => ({
            deal_id: d.deal_id,
            description_en:
              d.transaction_type === 'financing'
                ? `${d.buyer[0]?.value ?? 'The owner'} secured financing for ${d.asset}.`
                : `${d.buyer[0]?.value ?? 'An investor'} acquired ${d.asset}.`,
          })),
        }
        return request.schema.parse(answer)
      }
      const url = /^URL: (.+)$/m.exec(request.user)?.[1]?.trim() ?? ''
      const fixture = fixtures.find((f) => f.url === url)
      const extraction = options.extractionFor?.(url, fixture) ?? fixture?.extraction ?? { is_relevant: false, deals: [] }
      const answer =
        request.name === 'deepening_extraction'
          ? { ...extraction, deals: extraction.deals.map((d) => ({ ...d, same_transaction: true })) }
          : extraction
      return request.schema.parse(answer)
    },
  }

  return { opoint, tavily, llm }
}
