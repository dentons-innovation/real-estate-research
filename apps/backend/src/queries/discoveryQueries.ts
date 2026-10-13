import type { ResearchWindow } from '@re/shared'
import type { DomainLists } from '../config/domains'
import type { LaneId } from '../types'
import { fold } from '../verify/normalize'

/**
 * Discovery query generator. Tavily is a semantic search engine, so every
 * query is a plain sentence that reads like the headline of the article we
 * want, in the two languages the Polish trade press publishes in. The research
 * window is applied by Tavily's date filter, not by words in the query.
 *
 * One run issues roughly 42 queries over seven lane × scope queues; the cap
 * (TAVILY_MAX_DISCOVERY_QUERIES) takes from the queues in turns, so a small
 * cap still reaches every lane and every kind of source.
 */

export type DiscoveryScope = 'web' | 'trade' | 'legal-press' | 'law'

export interface DiscoveryQuery {
  lane: LaneId
  query: string
  topic: 'news' | 'general'
  /** Restrict to these sites; undefined = open web. */
  includeDomains?: string[]
  scope: DiscoveryScope
  /** Apply the window's date filter. Law-firm sites are searched undated: Tavily has no dates for them, their text and URLs do. */
  dated: boolean
}

/** Sales and acquisitions, one sentence per asset group. */
const SALES = [
  'investor acquires office building in Poland',
  'logistics park in Poland sold to investor',
  'fund acquires shopping centre or retail park in Poland',
  'PRS residential portfolio, hotel or land plot in Poland acquired by investor',
  'inwestor kupił biurowiec w Warszawie transakcja',
  'fundusz kupił park logistyczny magazyny w Polsce transakcja',
  'fundusz kupił park handlowy centrum handlowe w Polsce',
  'inwestor kupił portfel mieszkań na wynajem PRS, hotel lub grunt inwestycyjny w Polsce',
]

/** Financings, refinancings and joint ventures. */
const FINANCING = [
  'Polish real estate company secures financing from bank for portfolio',
  'bank refinances office building or logistics portfolio in Poland with a loan',
  'joint venture platform for real estate investment in Poland',
  'bank udzielił kredytu na refinansowanie biurowca lub centrum handlowego w Polsce',
  'deweloper pozyskał finansowanie budowy magazynów kredyt inwestycyjny',
  'inwestor i deweloper zawarli joint venture na rynku nieruchomości komercyjnych w Polsce',
]

/** Law firm credits as the open web reports them. */
const LAW_WEB = [
  'law firm advised on the sale of an office building in Poland',
  'law firm advised on the financing of a logistics park in Poland',
  'kancelaria doradzała przy sprzedaży nieruchomości komercyjnej w Polsce',
]

/** The legal press: deal credits for every firm, in one place. */
const LEGAL_PRESS = [
  'law firm advises on acquisition of real estate in Poland',
  'law firm advises bank on financing of real estate portfolio in Poland',
  'kancelaria doradzała przy nabyciu nieruchomości w Polsce',
  'kancelaria doradzała bankowi przy finansowaniu nieruchomości',
]

/** Headline-like phrasings for the firms' own sites, alternated across the domain chunks. */
const LAW_SITE = [
  'advised on the sale of an office building, logistics park or shopping centre in Poland',
  'advised the lender or the borrower on the financing of real estate in Poland',
]
const LAW_SITE_PL = 'kancelaria doradzała przy sprzedaży, nabyciu lub finansowaniu nieruchomości w Polsce'

/** How many law firm sites share one query: 25 sites dividing 15 results found nothing. */
export const LAW_CHUNK_SIZE = 5

/** Queue order: the open web first (it carries dates), then the trade and legal press, then the firms' own sites. */
const QUEUE_ORDER: Array<`${LaneId}|${DiscoveryScope}`> = [
  'sales|web',
  'financing|web',
  'lawfirms|legal-press',
  'sales|trade',
  'financing|trade',
  'lawfirms|web',
  'lawfirms|law',
]

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Round-robin across the lane × scope queues, so a cap never silences a kind of source. */
function capRoundRobin(queries: DiscoveryQuery[], max: number): DiscoveryQuery[] {
  const queues = QUEUE_ORDER.map((key) => queries.filter((q) => `${q.lane}|${q.scope}` === key))
  const out: DiscoveryQuery[] = []
  while (out.length < max && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next && out.length < max) out.push(next)
    }
  }
  return out
}

export function buildDiscoveryQueries(_window: ResearchWindow, lists: DomainLists, maxQueries: number): DiscoveryQuery[] {
  const all: DiscoveryQuery[] = []
  const seen = new Set<string>()
  const push = (q: DiscoveryQuery) => {
    const key = `${fold(q.query)}|${q.scope}|${(q.includeDomains ?? []).join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    all.push({ ...q, query: q.query.replace(/\s+/g, ' ').trim() })
  }

  for (const text of SALES) {
    push({ lane: 'sales', query: text, topic: 'news', scope: 'web', dated: true })
    push({ lane: 'sales', query: text, topic: 'general', includeDomains: lists.tradePress, scope: 'trade', dated: true })
  }
  for (const text of FINANCING) {
    push({ lane: 'financing', query: text, topic: 'news', scope: 'web', dated: true })
    push({ lane: 'financing', query: text, topic: 'general', includeDomains: lists.tradePress, scope: 'trade', dated: true })
  }
  for (const text of LAW_WEB) push({ lane: 'lawfirms', query: text, topic: 'news', scope: 'web', dated: true })
  for (const text of LEGAL_PRESS) push({ lane: 'lawfirms', query: text, topic: 'general', includeDomains: lists.legalPress, scope: 'legal-press', dated: true })

  const chunks = chunk(lists.lawFirms, LAW_CHUNK_SIZE)
  chunks.forEach((domains, i) => push({ lane: 'lawfirms', query: LAW_SITE[i % LAW_SITE.length], topic: 'general', includeDomains: domains, scope: 'law', dated: false }))
  // the Polish firms publish in Polish: one query in their language for the chunk with most .pl sites
  const polishCount = (domains: string[]) => domains.filter((d) => d.endsWith('.pl')).length
  const polish = [...chunks].sort((a, b) => polishCount(b) - polishCount(a))[0]
  if (polish && polishCount(polish) > 0) push({ lane: 'lawfirms', query: LAW_SITE_PL, topic: 'general', includeDomains: polish, scope: 'law', dated: false })

  return capRoundRobin(all, maxQueries)
}
