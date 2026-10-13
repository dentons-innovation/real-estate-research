import { TAVILY_MAX_QUERY_CHARS } from '../clients/tavily'
import type { DomainLists } from '../config/domains'
import { familyOf } from '../deals/dedup'
import { isDistinctiveAsset, searchableAssetName } from '../deals/entityNames'
import { GAP_WEIGHTS, type Gap } from '../deals/gaps'
import type { MergedDeal } from '../types'
import { fold } from '../verify/normalize'

export { searchableAssetName }

/**
 * Targeted queries for the missing fields of ONE known deal. Fully
 * programmatic: the gap decides the template, the deal supplies the names.
 */

export interface DeepeningQuery {
  query: string
  /** Restrict to these sites; undefined = open web. */
  includeDomains?: string[]
  scope: 'law' | 'press' | 'web'
  gap: Gap
}

const SECTOR_WORDS: Record<string, { pl: string; en: string }> = {
  office: { pl: 'biurowiec', en: 'office' },
  retail: { pl: 'centrum handlowe', en: 'retail' },
  'logistics-industrial': { pl: 'magazyn logistyka', en: 'logistics warehouse' },
  residential: { pl: 'mieszkania PRS', en: 'residential' },
  land: { pl: 'grunt', en: 'land' },
  hotel: { pl: 'hotel', en: 'hotel' },
  'not identified': { pl: 'nieruchomość', en: 'real estate' },
}

const join = (...parts: Array<string | null | undefined>) =>
  parts
    .filter((p): p is string => !!p && p.trim() !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

export function buildDeepeningQueries(deal: MergedDeal, gaps: Gap[], lists: DomainLists, maxQueries: number): DeepeningQuery[] {
  const buyer = deal.fields.buyer?.[0]?.value ?? null
  const seller = deal.fields.seller?.[0]?.value ?? null
  const city = deal.city
  const sector = SECTOR_WORDS[deal.sector] ?? SECTOR_WORDS['not identified']
  const financing = familyOf(deal.transactionType) === 'financing'

  const name = searchableAssetName(deal.assetName)
  const distinctive = isDistinctiveAsset(name)
  // a generic asset ("office building in Warsaw") cannot be searched by name — use the parties instead
  const asset = distinctive ? `"${name}"` : join(sector.en, city)
  const assetPl = distinctive ? `"${name}"` : join(sector.pl, city)
  if (!distinctive && !buyer && !seller) return []

  const pressDomains = [...lists.legalPress, ...lists.tradePress]
  const candidates: DeepeningQuery[] = []
  const add = (gap: Gap, query: string, scope: DeepeningQuery['scope']) => {
    const text = query.slice(0, TAVILY_MAX_QUERY_CHARS).trim()
    if (!text) return
    candidates.push({
      gap,
      query: text,
      scope,
      includeDomains: scope === 'law' ? lists.lawFirms : scope === 'press' ? pressDomains : undefined,
    })
  }

  // a deal without a date is lost: any second report of it carries one (in its text or its URL)
  if (gaps.includes('announcement_date')) {
    add('announcement_date', join(asset, buyer ?? seller, financing ? 'financing announced' : 'sale acquisition announced'), 'press')
    add('announcement_date', join(assetPl, buyer ?? seller, financing ? 'finansowanie kredyt' : 'transakcja sprzedaż nabycie'), 'web')
  }

  const advisorGaps = gaps.filter((g) => g === 'buyer_legal_advisor' || g === 'seller_legal_advisor')
  if (advisorGaps.length > 0) {
    const gap = advisorGaps[0]
    const verb = financing ? 'advised financing' : 'advised'
    add(gap, join(asset, buyer ?? seller, verb), 'law')
    add(gap, join(assetPl, 'kancelaria doradzała', buyer ?? seller), 'web')
    add(gap, join(asset, buyer, seller, 'legal advisor counsel'), 'press')
    if (buyer || seller) add(gap, join(buyer, seller, city, financing ? 'advised financing' : 'advised acquisition', sector.en), 'law')
  }
  if (gaps.includes('deal_value')) {
    if (financing) {
      add('deal_value', join(assetPl, buyer, 'kredyt finansowanie mln euro'), 'web')
      add('deal_value', join(asset, buyer, 'financing facility EUR million'), 'web')
    } else {
      add('deal_value', join(assetPl, buyer, 'wartość transakcji mln euro'), 'web')
      add('deal_value', join(asset, 'acquisition price EUR million', buyer), 'web')
      add('deal_value', join(assetPl, 'raport bieżący umowa sprzedaży cena'), 'web')
    }
  }
  if (gaps.includes('seller')) add('seller', join(assetPl, 'sprzedający "sold by" vendor', buyer), 'web')
  if (gaps.includes('buyer')) add('buyer', join(assetPl, financing ? 'kredytobiorca borrower' : 'kupujący nabywca "acquired by"', seller), 'web')

  // interleave by gap so every gap gets its best query before any gap gets its second
  const byGap = new Map<Gap, DeepeningQuery[]>()
  for (const c of candidates) byGap.set(c.gap, [...(byGap.get(c.gap) ?? []), c])
  const gapOrder = [...byGap.keys()].sort((a, b) => GAP_WEIGHTS[b] - GAP_WEIGHTS[a])
  const out: DeepeningQuery[] = []
  const seen = new Set<string>()
  for (let round = 0; out.length < maxQueries; round++) {
    let took = false
    for (const gap of gapOrder) {
      const next = byGap.get(gap)?.[round]
      if (!next) continue
      took = true
      const key = `${fold(next.query)}|${next.scope}`
      if (seen.has(key) || out.length >= maxQueries) continue
      seen.add(key)
      out.push(next)
    }
    if (!took) break
  }
  return out
}
