import { inDomainList, type DomainLists } from '../config/domains'
import { ADVISORY_STEMS, ASSET_STEMS, FINANCING_STEMS, NOISE_STEMS, POLAND_MARKERS, TRANSACTION_STEMS } from '../queries/lexicon'
import type { Article, LaneId } from '../types'
import { fold, tokenize } from '../verify/normalize'
import { canonicalUrl, isExcludedPath, isPdfUrl, MIN_ARTICLE_CHARS } from './articleText'

/**
 * Deterministic prefilter in front of the (paid, slow) extraction model:
 * drops unusable pages, collapses syndicated copies, keeps the most
 * transaction-like articles.
 */

const hits = (text: string, stems: string[]) => stems.reduce((n, stem) => (text.includes(stem) ? n + 1 : n), 0)

export function relevanceScore(article: Pick<Article, 'title' | 'text' | 'url'>, lists: DomainLists): number {
  const title = fold(article.title)
  const body = fold(article.text.slice(0, 6000))
  const deal = hits(body, TRANSACTION_STEMS) + hits(body, FINANCING_STEMS)
  const asset = hits(body, ASSET_STEMS)
  const poland = hits(body, POLAND_MARKERS)
  if (deal === 0 || asset === 0) return 0

  let score = Math.min(deal, 5) * 2 + Math.min(asset, 4) + Math.min(poland, 3) * 1.5
  score += (hits(title, TRANSACTION_STEMS) + hits(title, FINANCING_STEMS)) * 3
  score += Math.min(hits(body, ADVISORY_STEMS), 2) * 2
  if (/\b\d+(?:[.,]\d+)?\s?(?:mln|mld|million|billion|m)\b/.test(body) && /€|\beur|\bpln\b|\bzl\b/.test(body)) score += 2
  if (inDomainList(article.url, lists.lawFirms)) score += 4
  else if (inDomainList(article.url, lists.tradePress) || inDomainList(article.url, lists.legalPress)) score += 3
  // lease news and market reports mention the same vocabulary
  const noiseInTitle = hits(title, NOISE_STEMS)
  if (noiseInTitle > 0 && hits(title, TRANSACTION_STEMS) + hits(title, FINANCING_STEMS) === 0) score -= 5
  if (poland === 0) score -= 4
  return score
}

/** Topic of an article that did not come from a lane query (Opoint). */
export function classifyLane(article: Pick<Article, 'title' | 'text' | 'url'>, lists: DomainLists): LaneId {
  if (inDomainList(article.url, lists.lawFirms) || inDomainList(article.url, lists.legalPress)) return 'lawfirms'
  const head = fold(`${article.title} ${article.text.slice(0, 1500)}`)
  return hits(head, FINANCING_STEMS) > hits(head, TRANSACTION_STEMS) ? 'financing' : 'sales'
}

function titleSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  const inter = a.filter((t) => setB.has(t)).length
  return inter / (a.length + b.length - inter)
}

export interface PrefilterResult {
  kept: Article[]
  stats: { input: number; unusable: number; duplicates: number; irrelevant: number; overCap: number }
}

export function prefilterArticles(articles: Article[], lists: DomainLists, maxArticles: number): PrefilterResult {
  const stats = { input: articles.length, unusable: 0, duplicates: 0, irrelevant: 0, overCap: 0 }

  // 1. usable pages, one per canonical URL (longest text wins)
  const byUrl = new Map<string, Article>()
  for (const article of articles) {
    if (
      !/^https?:\/\//i.test(article.url) ||
      isPdfUrl(article.url) ||
      isExcludedPath(article.url) ||
      inDomainList(article.url, lists.excluded) ||
      article.text.length < MIN_ARTICLE_CHARS
    ) {
      stats.unusable += 1
      continue
    }
    const key = canonicalUrl(article.url)
    const existing = byUrl.get(key)
    if (!existing) byUrl.set(key, article)
    else {
      stats.duplicates += 1
      if (article.text.length > existing.text.length) byUrl.set(key, { ...article, publishedAt: article.publishedAt ?? existing.publishedAt })
      else if (!existing.publishedAt && article.publishedAt) byUrl.set(key, { ...existing, publishedAt: article.publishedAt })
    }
  }

  // 2. relevance
  const scored: Array<{ article: Article; score: number; titleTokens: string[] }> = []
  for (const article of byUrl.values()) {
    const score = relevanceScore(article, lists)
    if (score < 6) {
      stats.irrelevant += 1
      continue
    }
    scored.push({ article, score, titleTokens: tokenize(article.title).filter((t) => t.length >= 3) })
  }
  scored.sort((a, b) => b.score - a.score || a.article.url.localeCompare(b.article.url))

  // 3. syndicated copies on the SAME site family are noise; across sites they are corroboration —
  //    collapse only near-identical titles from the same host
  const kept: typeof scored = []
  for (const item of scored) {
    const host = new URL(item.article.url).hostname
    const duplicate = kept.some(
      (k) => new URL(k.article.url).hostname === host && item.titleTokens.length >= 4 && titleSimilarity(item.titleTokens, k.titleTokens) >= 0.85,
    )
    if (duplicate) {
      stats.duplicates += 1
      continue
    }
    kept.push(item)
  }

  // 4. cap, round-robin across lanes so a busy lane cannot starve the others
  const result = roundRobinByLane(kept.map((k) => k.article), maxArticles)
  stats.overCap = kept.length - result.length
  return { kept: result, stats }
}

function roundRobinByLane(sorted: Article[], max: number): Article[] {
  if (sorted.length <= max) return sorted
  const queues = new Map<LaneId, Article[]>()
  for (const a of sorted) queues.set(a.lane, [...(queues.get(a.lane) ?? []), a])
  const out: Article[] = []
  while (out.length < max) {
    let took = false
    for (const queue of queues.values()) {
      const next = queue.shift()
      if (next && out.length < max) {
        out.push(next)
        took = true
      }
    }
    if (!took) break
  }
  return out
}
