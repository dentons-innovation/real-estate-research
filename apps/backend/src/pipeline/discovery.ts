import type { TavilyResult } from '../clients/tavily'
import { inDomainList } from '../config/domains'
import { canonicalUrl, isExcludedPath, isPdfUrl, MIN_ARTICLE_CHARS, prepareArticleText } from '../extraction/articleText'
import { extractArticle } from '../extraction/extractArticle'
import { classifyLane, prefilterArticles } from '../extraction/prefilter'
import { buildDiscoveryQueries } from '../queries/discoveryQueries'
import { LANE_ORDER, type Article, type CandidateDeal, type LaneId } from '../types'
import { isAbort, throwIfAborted } from '../util/concurrency'
import type { PipelineContext } from './context'
import { msg } from './messages'

/**
 * Phase 1 — Discovery. Opoint (media monitoring) and Tavily (three query
 * lanes) collect articles; the model extracts deals one article at a time;
 * every extracted fact is verified against the article text.
 */

export interface DiscoveryResult {
  candidates: CandidateDeal[]
  articlesScanned: number
  opointUsed: boolean
}

/** Pages Tavily returned without full text are fetched only from sites we trust most. */
const MAX_EXTRA_EXTRACTS = 20
const PROGRESS_EVERY = 10

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 200)

async function fetchOpoint(ctx: PipelineContext): Promise<Article[]> {
  if (!ctx.opoint) {
    // not plugged into this run (user's choice, OPOINT_ENABLED=false or no token)
    ctx.emit(msg.opointOff())
    return []
  }
  ctx.emit(msg.opointFetch(ctx.window))
  try {
    const result = await ctx.opoint.fetchArticles(ctx.window, ctx.signal)
    for (const warning of result.warnings) ctx.emit(msg.opointWarning(warning))
    ctx.emit(msg.opointResult(result.articles.length))
    return result.articles.map((a) => {
      const base = { url: a.url, title: a.title, text: prepareArticleText(a.text), publishedAt: a.publishedAt, origin: 'opoint' as const }
      return { ...base, lane: classifyLane(base, ctx.lists) }
    })
  } catch (err) {
    if (isAbort(err) || ctx.signal.aborted) throw err
    // Opoint is an accelerator, not a dependency: the run continues on Tavily
    ctx.emit(msg.opointUnavailable(errorText(err)))
    return []
  }
}

interface TavilyHarvest {
  articles: Article[]
  queries: number
  failedQueries: number
  pages: number
}

async function fetchTavily(ctx: PipelineContext): Promise<TavilyHarvest> {
  const queries = buildDiscoveryQueries(ctx.window, ctx.lists, ctx.settings.maxDiscoveryQueries)
  const found = new Map<string, { result: TavilyResult; lane: LaneId }>()
  let failedQueries = 0
  let lastError = ''

  await Promise.all(
    queries.map(async (q) => {
      try {
        const results = await ctx.tavily.search({
          query: q.query,
          topic: q.topic,
          startDate: q.dated ? ctx.window.from : undefined,
          endDate: q.dated ? ctx.window.to : undefined,
          includeDomains: q.includeDomains,
          excludeDomains: q.includeDomains ? undefined : ctx.lists.excluded,
          // the open web is the widest net; site-restricted searches saturate sooner
          maxResults: q.scope === 'web' ? 20 : 15,
          rawContent: true,
          purpose: 'discovery',
          signal: ctx.signal,
        })
        for (const result of results) {
          if (isPdfUrl(result.url) || isExcludedPath(result.url)) continue
          const key = canonicalUrl(result.url)
          const existing = found.get(key)
          // keep the copy with full text and a date; the first lane that found the page keeps it
          if (!existing) found.set(key, { result, lane: q.lane })
          else {
            existing.result = {
              ...existing.result,
              rawContent: existing.result.rawContent ?? result.rawContent,
              publishedAt: existing.result.publishedAt ?? result.publishedAt,
            }
          }
        }
      } catch (err) {
        if (isAbort(err) || ctx.signal.aborted) throw err
        failedQueries += 1
        lastError = errorText(err)
      }
    }),
  )
  throwIfAborted(ctx.signal)
  if (queries.length > 0 && failedQueries === queries.length) {
    throw new Error(`Tavily: żadne zapytanie nie powiodło się (${lastError})`)
  }
  if (failedQueries > 0) ctx.emit(msg.warning('Deep research', `Tavily: ${failedQueries} z ${queries.length} zapytań nie powiodło się (${lastError}).`))

  // full text for trusted pages that came back as snippets only
  const trusted = [...ctx.lists.lawFirms, ...ctx.lists.tradePress, ...ctx.lists.legalPress]
  const missing = [...found.values()]
    .filter((f) => !f.result.rawContent && inDomainList(f.result.url, trusted))
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, MAX_EXTRA_EXTRACTS)
  if (missing.length > 0) {
    try {
      const extracted = await ctx.tavily.extract(missing.map((m) => m.result.url), ctx.signal)
      for (const e of extracted) {
        const entry = found.get(canonicalUrl(e.url))
        if (entry) entry.result = { ...entry.result, rawContent: e.rawContent }
      }
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) throw err
    }
  }

  const articles: Article[] = []
  for (const { result, lane } of found.values()) {
    const text = prepareArticleText(result.rawContent ?? '')
    if (text.length < MIN_ARTICLE_CHARS) continue
    articles.push({ url: result.url, title: result.title, text, publishedAt: result.publishedAt, origin: 'tavily', lane })
  }
  return { articles, queries: queries.length, failedQueries, pages: found.size }
}

export async function runDiscovery(ctx: PipelineContext): Promise<DiscoveryResult> {
  const opointPromise = fetchOpoint(ctx)
  // an Opoint failure must not surface as an unhandled rejection while Tavily is still running
  opointPromise.catch(() => {})
  ctx.emit(msg.lanesStart())
  const [opointArticles, tavily] = await Promise.all([opointPromise, fetchTavily(ctx)])
  throwIfAborted(ctx.signal)

  // Opoint first: on a URL collision its text (licensed full text) and date win
  const { kept } = prefilterArticles([...opointArticles, ...tavily.articles], ctx.lists, ctx.settings.maxArticlesForExtraction)
  ctx.emit(msg.searchDone(tavily.queries, tavily.pages + opointArticles.length, kept.length))

  const done = new Set<LaneId>()
  const candidates: CandidateDeal[] = []
  let analysed = 0
  let failed = 0
  let lastError = ''

  const remaining = new Map<LaneId, number>(LANE_ORDER.map((lane) => [lane, kept.filter((a) => a.lane === lane).length]))
  const finishLane = (lane: LaneId) => {
    if (done.has(lane)) return
    done.add(lane)
    // the last lane is announced by the dedup phase that follows
    if (done.size < LANE_ORDER.length) ctx.emit(msg.laneProgress(done))
  }
  for (const lane of LANE_ORDER) if ((remaining.get(lane) ?? 0) === 0) finishLane(lane)

  await Promise.all(
    kept.map(async (article) => {
      try {
        const outcome = await extractArticle(article, ctx.llm, { lists: ctx.lists, audit: ctx.audit }, ctx.signal)
        candidates.push(...outcome.candidates)
      } catch (err) {
        if (isAbort(err) || ctx.signal.aborted) throw err
        failed += 1
        lastError = errorText(err)
      } finally {
        analysed += 1
        if (!ctx.signal.aborted) {
          if (analysed % PROGRESS_EVERY === 0 && analysed < kept.length) ctx.emit(msg.extractionProgress(analysed, kept.length, candidates.length, done))
          const left = (remaining.get(article.lane) ?? 1) - 1
          remaining.set(article.lane, left)
          if (left === 0) finishLane(article.lane)
        }
      }
    }),
  )
  throwIfAborted(ctx.signal)

  // a few failed articles are tolerable; a failing model is not
  if (kept.length > 0 && failed > kept.length / 2) {
    throw new Error(`Analiza artykułów nie powiodła się dla ${failed} z ${kept.length} źródeł (${lastError})`)
  }
  if (failed > 0) ctx.emit(msg.warning('Deep research', `Pominięto ${failed} artykułów, których analiza nie powiodła się (${lastError}).`))

  return { candidates, articlesScanned: kept.length, opointUsed: opointArticles.length > 0 }
}
