import type { ResearchWindow } from '@re/shared'
import type { AppConfig } from '../config/env'
import { toIsoDay, unixSeconds } from '../deals/dates'
import { HttpError, requestJson } from './http'

/**
 * Opoint media monitoring client.
 *
 * Access is through a stored search (profile). Three strategies, tried in
 * order when OPOINT_MODE=auto:
 *   search_profile — POST /search/ with searchterm "profile:<id>" and a time range
 *   feed           — GET /storedsearch/feed/ (for keys limited to the feed)
 *   query          — POST /search/ with a generated boolean query (no stored search)
 */

export interface OpointArticle {
  url: string
  title: string
  text: string
  publishedAt: string | null
  language: string | null
}

export interface OpointFetchResult {
  articles: OpointArticle[]
  mode: 'search_profile' | 'feed' | 'query'
  /** Non-fatal problems worth showing in the log. */
  warnings: string[]
}

export interface OpointClient {
  fetchArticles(window: ResearchWindow, signal?: AbortSignal): Promise<OpointFetchResult>
}

interface RawText {
  text?: string
}

interface RawDocument {
  header?: RawText | string
  summary?: RawText | string
  body?: RawText | string
  orig_url?: string
  url?: string
  unix_timestamp?: number
  language?: RawText | string
}

interface RawSearchResponse {
  searchresult?: {
    document?: RawDocument[]
    documents?: number
    context?: string
    next_from?: number
  }
}

const PAGE_SIZE = 100
const MAX_FEED_CALLS = 60

const textOf = (value: RawText | string | undefined): string => (typeof value === 'string' ? value : (value?.text ?? ''))

/** Opoint marks search hits with <match> tags and may return light HTML. */
const stripMarkup = (value: string): string => value.replace(/<\/?[a-z][^>]*>/gi, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()

export function mapOpointDocument(doc: RawDocument): OpointArticle | null {
  const url = (doc.orig_url || doc.url || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  const title = stripMarkup(textOf(doc.header))
  const summary = stripMarkup(textOf(doc.summary))
  const body = stripMarkup(textOf(doc.body))
  // the summary is usually the lead of the body — do not repeat it
  const text = body.startsWith(summary.slice(0, 80)) || !summary ? body : `${summary}\n\n${body}`
  return {
    url,
    title,
    text: text.trim(),
    publishedAt: toIsoDay(doc.unix_timestamp),
    language: textOf(doc.language) || null,
  }
}

/**
 * Generated boolean query for the `query` mode. Opoint wildcards need at
 * least 3 leading characters. Leases are not excluded here (deal news
 * mentions tenants); they are filtered at extraction.
 */
export const OPOINT_BOOLEAN_QUERY = [
  '(nieruchomoś* OR biurow* OR magazyn* OR logistyczn* OR "park handlowy" OR "centrum handlowe" OR "galeria handlowa" OR PRS OR hotel* OR "grunt inwestycyjny" OR office OR warehouse OR "retail park")',
  'AND (sprzeda* OR kupi* OR naby* OR przeję* OR akwizycj* OR "umowa przedwstępna" OR finansowan* OR refinansowan* OR "joint venture" OR acquir* OR acquisition OR "sold to" OR financing)',
  'AND (Polska OR Polsce OR Poland OR Warszaw* OR Krak* OR Wrocław* OR Pozna* OR Gdańsk* OR Łódź OR Katowic*)',
].join(' ')

export function createOpointClient(config: AppConfig): OpointClient {
  const base = config.OPOINT_BASE_URL.replace(/\/+$/, '')
  const headers = { Authorization: `Token ${config.OPOINT_TOKEN}` }
  const max = config.OPOINT_MAX_ARTICLES

  const search = async (searchterm: string, window: ResearchWindow, signal?: AbortSignal): Promise<OpointArticle[]> => {
    const out: OpointArticle[] = []
    const seen = new Set<string>()
    let context: string | undefined
    // newest-first pages; `newest` moves back past the oldest hit of the previous page
    let newest = unixSeconds(window.to, true)
    const oldest = unixSeconds(window.from)
    for (let page = 0; page < Math.ceil(max / PAGE_SIZE) + 1 && out.length < max; page++) {
      const data = await requestJson<RawSearchResponse>({
        provider: 'Opoint',
        url: `${base}/search/`,
        headers,
        body: {
          searchterm,
          params: {
            requestedarticles: Math.min(PAGE_SIZE, max - out.length),
            oldest,
            newest,
            groupidentical: true,
            main: { header: 1, summary: 1, text: 1 },
            ...(context ? { context } : {}),
          },
        },
        timeoutMs: 60000,
        signal,
      })
      const docs = data.searchresult?.document ?? []
      let added = 0
      let oldestSeen = newest
      for (const doc of docs) {
        if (typeof doc.unix_timestamp === 'number') oldestSeen = Math.min(oldestSeen, doc.unix_timestamp)
        const article = mapOpointDocument(doc)
        if (!article || seen.has(article.url)) continue
        seen.add(article.url)
        out.push(article)
        added += 1
      }
      if (docs.length < PAGE_SIZE || added === 0) break
      context = data.searchresult?.context || undefined
      if (!context) {
        if (oldestSeen >= newest) break
        newest = oldestSeen - 1
      }
    }
    return out
  }

  const feed = async (window: ResearchWindow, signal: AbortSignal | undefined, warnings: string[]): Promise<OpointArticle[]> => {
    const out: OpointArticle[] = []
    const seen = new Set<string>()
    const end = unixSeconds(window.to, true)
    let from = unixSeconds(window.from)
    for (let call = 0; call < MAX_FEED_CALLS && out.length < max; call++) {
      const params = new URLSearchParams({ from: String(from), to: String(end), num_art: String(PAGE_SIZE), format: 'json' })
      if (config.OPOINT_STORED_SEARCH_ID) params.set('id', config.OPOINT_STORED_SEARCH_ID)
      const data = await requestJson<RawSearchResponse>({
        provider: 'Opoint',
        url: `${base}/storedsearch/feed/?${params.toString()}`,
        method: 'GET',
        headers,
        timeoutMs: 60000,
        signal,
      })
      for (const doc of data.searchresult?.document ?? []) {
        const article = mapOpointDocument(doc)
        if (!article || seen.has(article.url)) continue
        seen.add(article.url)
        out.push(article)
      }
      const next = data.searchresult?.next_from
      if (typeof next !== 'number' || next <= from || next >= end) break
      from = next
      if (call === MAX_FEED_CALLS - 1) warnings.push('feed Opoint nie został pobrany w całości (limit wywołań) — pokrycie okna może być niepełne')
    }
    return out
  }

  return {
    async fetchArticles(window, signal) {
      const warnings: string[] = []
      const mode = config.OPOINT_MODE
      const profileId = config.OPOINT_STORED_SEARCH_ID

      const runQuery = async (): Promise<OpointFetchResult> => ({
        articles: await search(OPOINT_BOOLEAN_QUERY, window, signal),
        mode: 'query',
        warnings,
      })

      if (mode === 'query' || (mode === 'auto' && !profileId)) return runQuery()
      if (mode === 'feed') return { articles: await feed(window, signal, warnings), mode: 'feed', warnings }

      let result: OpointFetchResult
      try {
        if (!profileId) throw new Error('Opoint: brak OPOINT_STORED_SEARCH_ID dla trybu search_profile')
        result = { articles: await search(`profile:${profileId}`, window, signal), mode: 'search_profile', warnings }
      } catch (err) {
        const denied = err instanceof HttpError && [400, 401, 403, 404].includes(err.status)
        if (mode !== 'auto' || !denied) throw err
        warnings.push(`wyszukiwanie po profilu odrzucone (HTTP ${(err as HttpError).status}) — używam feedu zapisanego wyszukiwania`)
        result = { articles: await feed(window, signal, warnings), mode: 'feed', warnings }
      }

      if (config.OPOINT_EXTRA_QUERY_ENABLED) {
        try {
          const extra = await search(OPOINT_BOOLEAN_QUERY, window, signal)
          const known = new Set(result.articles.map((a) => a.url))
          result.articles.push(...extra.filter((a) => !known.has(a.url)))
        } catch (err) {
          if (signal?.aborted) throw err
          warnings.push(`dodatkowe zapytanie Opoint nie powiodło się (${err instanceof Error ? err.message : String(err)})`)
        }
      }
      return result
    },
  }
}
