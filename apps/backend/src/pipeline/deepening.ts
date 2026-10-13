import type { TavilyResult } from '../clients/tavily'
import { inDomainList } from '../config/domains'
import { compareDeals, keyOfCandidate, keyOfMerged } from '../deals/dedup'
import { assetTokens, partyTokens } from '../deals/entityNames'
import { planDeepening, type DeepeningPlan } from '../deals/gaps'
import { applyEnrichment } from '../deals/merge'
import { canonicalUrl, isExcludedPath, isPdfUrl, MIN_ARTICLE_CHARS, prepareArticleText } from '../extraction/articleText'
import { extractForDeal } from '../extraction/extractArticle'
import { buildDeepeningQueries } from '../queries/deepeningQueries'
import type { Article, MergedDeal } from '../types'
import { createLimiter, isAbort, throwIfAborted } from '../util/concurrency'
import { tokenize, tokenMatches } from '../verify/normalize'
import type { PipelineContext } from './context'
import { msg } from './messages'

/**
 * Phase 2 — Deepening. For every deal with gaps: targeted searches, a
 * code-level gate on the results, extraction restricted to the known deal,
 * and a fill-only-empty merge.
 */

const STEPS_PER_DEAL = 3

/** Does this page talk about the deal at all? Decided before any model call. */
export function mentionsDeal(deal: MergedDeal, pageText: string): boolean {
  const tokens = tokenize(pageText)
  const has = (needles: string[]) => needles.length > 0 && needles.every((n) => tokens.some((t) => tokenMatches(n, t)))
  if (deal.assetNames.some((name) => has(assetTokens(name)))) return true
  const buyer = partyTokens(deal.fields.buyer?.[0]?.value ?? '')
  const seller = partyTokens(deal.fields.seller?.[0]?.value ?? '')
  return has(buyer) && has(seller)
}

function selectSources(deal: MergedDeal, results: TavilyResult[], advisorsMissing: boolean, ctx: PipelineContext): TavilyResult[] {
  const known = new Set(deal.sources.map((s) => canonicalUrl(s.url)))
  const seen = new Set<string>()
  const eligible = results.filter((r) => {
    const key = canonicalUrl(r.url)
    if (known.has(key) || seen.has(key)) return false
    if (isPdfUrl(r.url) || isExcludedPath(r.url) || inDomainList(r.url, ctx.lists.excluded)) return false
    if (!mentionsDeal(deal, `${r.title}\n${r.content}\n${r.rawContent ?? ''}`)) return false
    seen.add(key)
    return true
  })
  const rank = (r: TavilyResult) => (advisorsMissing && inDomainList(r.url, ctx.lists.lawFirms) ? 0 : inDomainList(r.url, [...ctx.lists.legalPress, ...ctx.lists.tradePress]) ? 1 : 2)
  return eligible.sort((a, b) => rank(a) - rank(b) || b.score - a.score || a.url.localeCompare(b.url)).slice(0, ctx.settings.maxNewSourcesPerDeal)
}

async function loadArticles(selected: TavilyResult[], ctx: PipelineContext): Promise<Article[]> {
  const needText = selected.filter((r) => prepareArticleText(r.rawContent ?? '').length < 500)
  const fetched = new Map<string, string>()
  if (needText.length > 0) {
    try {
      for (const e of await ctx.tavily.extract(needText.map((r) => r.url), ctx.signal)) fetched.set(canonicalUrl(e.url), e.rawContent)
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted) throw err
    }
  }
  const articles: Article[] = []
  for (const r of selected) {
    const text = prepareArticleText(fetched.get(canonicalUrl(r.url)) ?? r.rawContent ?? '')
    if (text.length < MIN_ARTICLE_CHARS) continue
    articles.push({ url: r.url, title: r.title, text, publishedAt: r.publishedAt, origin: 'tavily', lane: 'lawfirms' })
  }
  return articles
}

export interface DeepeningResult {
  deepened: number
  fieldsFilled: number
}

export async function runDeepening(deals: MergedDeal[], ctx: PipelineContext): Promise<DeepeningResult> {
  const plan = planDeepening(deals, ctx.settings.deepenLimit)
  ctx.emit(msg.gaps(plan.length, deals.length))
  if (plan.length === 0) {
    ctx.emit(msg.noGaps(deals.length))
    return { deepened: 0, fieldsFilled: 0 }
  }

  const totalSteps = plan.length * STEPS_PER_DEAL
  let stepsDone = 0
  const progress = () => Math.min(1, stepsDone / totalSteps)
  let fieldsFilled = 0
  const limit = createLimiter(ctx.settings.deepenConcurrency)

  const deepenOne = async ({ deal, gaps }: DeepeningPlan, index: number): Promise<void> => {
    throwIfAborted(ctx.signal)
    const total = plan.length
    ctx.emit(msg.dealStart(deal.assetName, index, total, progress()))

    // step 1: targeted searches
    const queries = buildDeepeningQueries(deal, gaps, ctx.lists, ctx.settings.maxQueriesPerDeal)
    const results: TavilyResult[] = []
    await Promise.all(
      queries.map(async (q) => {
        try {
          // no date filter: law firm announcements often follow the press by weeks
          results.push(...(await ctx.tavily.search({ query: q.query, topic: 'general', includeDomains: q.includeDomains, excludeDomains: q.includeDomains ? undefined : ctx.lists.excluded, maxResults: 8, rawContent: true, purpose: 'deepening', signal: ctx.signal })))
        } catch (err) {
          if (isAbort(err) || ctx.signal.aborted) throw err
        }
      }),
    )
    throwIfAborted(ctx.signal)
    const advisorsMissing = gaps.some((g) => g === 'buyer_legal_advisor' || g === 'seller_legal_advisor')
    const selected = selectSources(deal, results, advisorsMissing, ctx)
    stepsDone += 1

    if (selected.length === 0) {
      stepsDone += 2
      ctx.emit(msg.dealNoSources(deal.assetName, index, total, progress()))
      return
    }

    // step 2: page texts
    ctx.emit(msg.dealSources(deal.assetName, index, total, selected.length, progress()))
    const articles = await loadArticles(selected, ctx)
    stepsDone += 1
    throwIfAborted(ctx.signal)

    // step 3: extraction restricted to this deal
    ctx.emit(msg.dealEnrich(deal.assetName, index, total, progress()))
    const filled = new Set<string>()
    const extractions = await Promise.all(
      articles.map(async (article) => {
        try {
          return await extractForDeal(article, deal, gaps, ctx.llm, { lists: ctx.lists, audit: ctx.audit }, ctx.signal)
        } catch (err) {
          if (isAbort(err) || ctx.signal.aborted) throw err
          return []
        }
      }),
    )
    // applied in a fixed order, so concurrent extraction cannot change the outcome
    for (const candidate of extractions.flat()) {
      // the model said "same transaction" — the code still checks for hard contradictions
      const comparison = compareDeals(keyOfMerged(deal), keyOfCandidate(candidate))
      if (comparison.vetoed && comparison.vetoReason !== 'date') {
        ctx.audit.push({ kind: 'note', reason: 'different_transaction', deal: deal.assetName, url: candidate.source.url, detail: `sprzeczność: ${comparison.vetoReason}` })
        continue
      }
      for (const field of applyEnrichment(deal, candidate, ctx.audit)) filled.add(field)
    }
    stepsDone += 1
    const count = [...filled].filter((f) => f !== 'other').length
    fieldsFilled += count
    ctx.emit(msg.dealResult(deal.assetName, index, total, count, progress()))
  }

  await Promise.all(plan.map((item, i) => limit(() => deepenOne(item, i + 1))))
  throwIfAborted(ctx.signal)
  return { deepened: plan.length, fieldsFilled }
}
