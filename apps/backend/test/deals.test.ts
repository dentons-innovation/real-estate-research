import { TRANSACTION_KEYS } from '@re/shared'
import { describe, expect, it } from 'vitest'
import { buildDomainLists } from '../src/config/domains'
import { TAVILY_MAX_QUERY_CHARS } from '../src/clients/tavily'
import { dateFromUrl, inWindow, monthEndFromUrl, monthsOfWindow, resolveWindow, tooOld, toPlDate, WindowError } from '../src/deals/dates'
import { isExcludedPath } from '../src/extraction/articleText'
import { prefilterArticles } from '../src/extraction/prefilter'
import { LAW_CHUNK_SIZE } from '../src/queries/discoveryQueries'
import { formatDealValue, parseDealValue, valuesConflict } from '../src/deals/dealValue'
import { clusterCandidates, clusterMergedDeals } from '../src/deals/dedup'
import { assetTokens, partySimilarity } from '../src/deals/entityNames'
import { gapsOf, planDeepening } from '../src/deals/gaps'
import { applyEnrichment, mergeCandidates, mergeMergedDeals } from '../src/deals/merge'
import { toRecord } from '../src/deals/toRecord'
import { descriptionSupported, templateDescription } from '../src/pipeline/compile'
import { buildDeepeningQueries, searchableAssetName } from '../src/queries/deepeningQueries'
import { buildDiscoveryQueries } from '../src/queries/discoveryQueries'
import type { AuditEntry, CandidateDeal, Evidence } from '../src/types'

const ev = (value: string, url: string, tier: 1 | 2 | 3 = 2): Evidence => ({ value, quote: `… ${value} …`, url, tier })

function candidate(partial: Partial<CandidateDeal> & { assetName: string; url: string }): CandidateDeal {
  const { url, ...rest } = partial
  return {
    city: null,
    transactionType: 'acquisition',
    status: 'signed',
    sector: 'office',
    description: '',
    announcementDate: '2026-09-10',
    dateBasis: 'published',
    fields: {},
    otherParties: [],
    otherAdvisors: [],
    source: { url, tier: 2, publishedAt: '2026-09-10' },
    ...rest,
  }
}

const shuffle = <T>(items: T[], seed: number): T[] => {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('deal value', () => {
  it('parses Polish and English notations', () => {
    expect(parseDealValue('EUR 300 million')).toEqual({ amount: 300_000_000, currency: 'EUR' })
    expect(parseDealValue('120 mln euro')).toEqual({ amount: 120_000_000, currency: 'EUR' })
    expect(parseDealValue('€36.4m')).toEqual({ amount: 36_400_000, currency: 'EUR' })
    expect(parseDealValue('1,2 mld zł')).toEqual({ amount: 1_200_000_000, currency: 'PLN' })
    expect(parseDealValue('ok. 85 mln EUR')).toEqual({ amount: 85_000_000, currency: 'EUR' })
  })

  it('does not guess when ambiguous', () => {
    expect(parseDealValue('300 million')).toBeNull()
    expect(parseDealValue('EUR 100 million (PLN 430 million)')).toBeNull()
  })

  it('formats for the table', () => {
    expect(formatDealValue({ amount: 120_000_000, currency: 'EUR' })).toBe('EUR 120 million')
    expect(formatDealValue({ amount: 1_200_000_000, currency: 'PLN' })).toBe('PLN 1.2 billion')
  })

  it('detects conflicting values', () => {
    expect(valuesConflict('EUR 120 million', '120 mln euro')).toBe(false)
    expect(valuesConflict('EUR 120 million', 'EUR 150 million')).toBe(true)
    expect(valuesConflict('EUR 120 million', 'PLN 500 million')).toBe(false)
  })
})

describe('research window', () => {
  const now = new Date('2026-09-29T10:00:00Z')
  const limits = { defaultDays: 30, maxDays: 90 }

  it('defaults to the last 30 days', () => {
    expect(resolveWindow({}, limits, now)).toEqual({ from: '2026-08-30', to: '2026-09-29', days: 30 })
    expect(resolveWindow({ range: '7d' }, limits, now)).toEqual({ from: '2026-09-22', to: '2026-09-29', days: 7 })
  })

  it('accepts explicit dates', () => {
    expect(resolveWindow({ from: '2026-09-01', to: '2026-09-15' }, limits, now)).toEqual({ from: '2026-09-01', to: '2026-09-15', days: 15 })
  })

  it('rejects bad input', () => {
    expect(() => resolveWindow({ range: '30' }, limits, now)).toThrow(WindowError)
    expect(() => resolveWindow({ range: '400d' }, limits, now)).toThrow(WindowError)
    expect(() => resolveWindow({ from: '2026-09-15', to: '2026-09-01' }, limits, now)).toThrow(WindowError)
    expect(() => resolveWindow({ from: '2026-09-15', to: '2026-10-15' }, limits, now)).toThrow(WindowError)
  })

  it('includes both edges', () => {
    const w = resolveWindow({}, limits, now)
    expect(inWindow('2026-08-30', w)).toBe(true)
    expect(inWindow('2026-09-29', w)).toBe(true)
    expect(inWindow('2026-08-29', w)).toBe(false)
  })

  it('formats dates for the table and lists months', () => {
    expect(toPlDate('2026-07-07')).toBe('7.07.2026')
    expect(toPlDate(null)).toBe('')
    expect(monthsOfWindow({ from: '2026-08-30', to: '2026-09-29', days: 30 }).map((m) => m.en)).toEqual(['September', 'August'])
  })

  it('reads a publication date out of the URL path', () => {
    expect(dateFromUrl('https://retailnet.pl/2026/06/29/p-a-nova-sprzedala-park-handlowy-w-nysie')).toBe('2026-06-29')
    expect(dateFromUrl('https://firm.example/news/2026-10-05-deal-closed')).toBe('2026-10-05')
    expect(dateFromUrl('https://eurobuildcee.com/news/64006-panattoni-sprzedaje')).toBeNull()
    expect(dateFromUrl('https://x.example/2026/13/40/nonsense')).toBeNull()
    expect(dateFromUrl('not a url')).toBeNull()
  })

  it('bounds the age of a page by the month in its URL', () => {
    expect(monthEndFromUrl('https://www.dentons.com/en/news/2026/october/dentons-advises-ppg')).toBe('2026-10-31')
    expect(monthEndFromUrl('https://firm.example/aktualnosci/2026/wrzesień/komunikat')).toBe('2026-09-30')
    expect(monthEndFromUrl('https://firm.example/news/2026/02/deal')).toBe('2026-02-28')
    expect(monthEndFromUrl('https://firm.example/news/2026/marketing/deal')).toBeNull()
    expect(monthEndFromUrl('https://eurobuildcee.com/news/64006-panattoni')).toBeNull()
  })

  it('flags a deal whose oldest report predates the window end by more than the limit', () => {
    const w = resolveWindow({}, limits, now)
    expect(tooOld('2026-06-29', w, 60)).toBe(true)
    expect(tooOld('2026-08-01', w, 60)).toBe(false)
    expect(tooOld('2026-07-31', w, 60)).toBe(false)
    expect(tooOld('2026-07-30', w, 60)).toBe(true)
  })
})

describe('deduplication', () => {
  const pl = candidate({
    assetName: 'Biurowiec Wisła Tower w Warszawie',
    url: 'https://a.example/1',
    fields: { buyer: ev('Nordhaven Capital', 'https://a.example/1'), deal_value: ev('120 mln euro', 'https://a.example/1') },
  })
  const en = candidate({
    assetName: 'Wisła Tower office building, Warsaw',
    url: 'https://b.example/2',
    fields: { buyer: ev('Nordhaven Capital S.A.', 'https://b.example/2'), deal_value: ev('EUR 120 million', 'https://b.example/2') },
  })
  const bare = candidate({ assetName: 'Wisła Tower', url: 'https://c.example/3' })
  const financing = candidate({
    assetName: 'Wisła Tower',
    url: 'https://d.example/4',
    transactionType: 'financing',
    fields: { buyer: ev('Nordhaven Capital', 'https://d.example/4') },
  })
  const other = candidate({ assetName: 'Logistic Hub Stryków', url: 'https://e.example/5', sector: 'logistics-industrial' })

  it('merges Polish and English reports of one deal', () => {
    const clusters = clusterCandidates([pl, en, bare])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toHaveLength(3)
  })

  it('keeps the sale and the financing of one building apart', () => {
    const clusters = clusterCandidates([pl, financing])
    expect(clusters).toHaveLength(2)
  })

  it('keeps different assets apart', () => {
    expect(clusterCandidates([pl, other])).toHaveLength(2)
  })

  it('keeps deals with different buyers or values apart', () => {
    const otherBuyer = candidate({ assetName: 'Wisła Tower', url: 'https://f.example/6', fields: { buyer: ev('Helios Hospitality', 'https://f.example/6') } })
    const otherValue = candidate({ assetName: 'Wisła Tower', url: 'https://g.example/7', fields: { deal_value: ev('EUR 200 million', 'https://g.example/7') } })
    expect(clusterCandidates([pl, otherBuyer])).toHaveLength(2)
    expect(clusterCandidates([pl, otherValue])).toHaveLength(2)
  })

  it('does not chain provably different deals through a vague report', () => {
    const otherBuyer = candidate({ assetName: 'Wisła Tower', url: 'https://f.example/6', fields: { buyer: ev('Helios Hospitality', 'https://f.example/6') } })
    // `bare` matches both, but the two sides contradict each other
    const clusters = clusterCandidates([pl, bare, otherBuyer])
    expect(clusters).toHaveLength(2)
  })

  it('does not merge unnamed assets on type and city alone', () => {
    const a = candidate({ assetName: 'office building in Warsaw', url: 'https://h.example/8' })
    const b = candidate({ assetName: 'biurowiec w Warszawie', url: 'https://i.example/9' })
    expect(clusterCandidates([a, b])).toHaveLength(2)
  })

  it('does not depend on input order', () => {
    const input = [pl, en, bare, financing, other]
    const shape = (cs: CandidateDeal[][]) => cs.map((c) => c.map((x) => x.source.url).sort().join(',')).sort()
    const expected = shape(clusterCandidates(input))
    for (let seed = 1; seed <= 12; seed++) expect(shape(clusterCandidates(shuffle(input, seed)))).toEqual(expected)
  })

  it('normalises phase names and ordinals in asset names', () => {
    expect(assetTokens('drugi etap BOOSTER Zabrze')).toEqual(['2', 'booster', 'zabrze'])
    expect(assetTokens('Phase 2 of BOOSTER ZABRZE')).toEqual(['2', 'booster', 'zabrze'])
    expect(assetTokens('second stage of Booster Zabrze')).toEqual(['2', 'booster', 'zabrze'])
    expect(assetTokens('Panattoni Park Poznań A2')).toEqual(['panattoni', 'a2'])
  })

  it('merges the same phase of one park reported in three languages', () => {
    const parties = (url: string) => ({ buyer: ev('Vestas Investment Management Europe', url), seller: ev('LemonTree', url) })
    const a = candidate({ assetName: 'drugi etap BOOSTER Zabrze', url: 'https://a.example/1', city: 'Zabrze', fields: parties('https://a.example/1') })
    const b = candidate({ assetName: 'Phase 2 of BOOSTER ZABRZE', url: 'https://b.example/2', transactionType: 'sale', fields: parties('https://b.example/2') })
    const c = candidate({ assetName: 'second stage of Booster Zabrze', url: 'https://c.example/3', transactionType: 'sale', fields: { seller: ev('LemonTree', 'https://c.example/3') } })
    expect(clusterCandidates([a, b, c])).toHaveLength(1)
  })

  it('keeps phase 1 and phase 2 of one park apart', () => {
    const a = candidate({ assetName: 'pierwszy etap BOOSTER Zabrze', url: 'https://a.example/1', fields: { seller: ev('LemonTree', 'https://a.example/1') } })
    const b = candidate({ assetName: 'Phase 2 of BOOSTER Zabrze', url: 'https://b.example/2', fields: { seller: ev('LemonTree', 'https://b.example/2') } })
    expect(clusterCandidates([a, b])).toHaveLength(2)
  })

  it('merges differently worded assets when both parties match', () => {
    const a = candidate({
      assetName: 'portfel magazynowy Hillwood',
      url: 'https://a.example/1',
      fields: { buyer: ev('Ares Management', 'https://a.example/1'), seller: ev('Hillwood Polska', 'https://a.example/1') },
    })
    const b = candidate({
      assetName: 'Hillwood logistics portfolio: Łódź Górna, Wrocław City I, Bieruń',
      url: 'https://b.example/2',
      fields: { buyer: ev('Ares', 'https://b.example/2'), seller: ev('Hillwood', 'https://b.example/2') },
    })
    expect(clusterCandidates([a, b])).toHaveLength(1)
  })

  it('treats a company and its local or foreign-language entity as one party', () => {
    expect(partySimilarity('Van der Vorm Poland', 'Van der Vorm Vastgoed')).toBeGreaterThanOrEqual(0.8)
    expect(partySimilarity('Hillwood Polska', 'Hillwood')).toBeGreaterThanOrEqual(0.8)
    expect(partySimilarity('Van der Vorm Poland', 'Vestas Investment Management Europe')).toBeLessThan(0.34)
    const en = candidate({
      assetName: 'Portfolio of seven residential projects in Warsaw and Krakow',
      url: 'https://a.example/1',
      transactionType: 'financing',
      announcementDate: '2026-10-12',
      fields: { buyer: ev('Van der Vorm Poland', 'https://a.example/1'), deal_value: ev('PLN 200 million', 'https://a.example/1') },
    })
    const pl = candidate({
      assetName: 'portfel siedmiu inwestycji mieszkaniowych w Warszawie i Krakowie',
      url: 'https://b.example/2',
      transactionType: 'financing',
      announcementDate: '2026-10-02',
      fields: { buyer: ev('Van der Vorm Vastgoed', 'https://b.example/2'), deal_value: ev('prawie 200 mln zł', 'https://b.example/2') },
    })
    expect(clusterCandidates([en, pl])).toHaveLength(1)
  })

  it('merges an unnamed portfolio with its itemised report on seller and price', () => {
    const a = candidate({
      assetName: 'portfolio of four logistics properties in Poland',
      url: 'https://firm.example/1',
      announcementDate: '2026-10-05',
      fields: { seller: ev('Hillwood', 'https://firm.example/1'), deal_value: ev('EUR 150 million', 'https://firm.example/1') },
    })
    const b = candidate({
      assetName: 'Hillwood Łódź Górna, Hillwood Wrocław City I, Hillwood Wrocław City II and Hillwood Bieruń',
      url: 'https://press.example/2',
      announcementDate: '2026-09-25',
      fields: { seller: ev('Hillwood Polska', 'https://press.example/2'), deal_value: ev('150 mln euro', 'https://press.example/2') },
    })
    expect(assetTokens(a.assetName)).toEqual([])
    expect(clusterCandidates([a, b])).toHaveLength(1)
  })

  it('merges same-day reports that name the same agent for a half-matching asset', () => {
    const agent = (url: string, name: string) => [{ name, role: 'agent', quote: `… ${name} …`, url, tier: 2 as const }]
    const a = candidate({ assetName: 'Nieruchomość przy ul. Puławskiej 436', url: 'https://a.example/1', announcementDate: '2026-10-05', otherParties: agent('https://a.example/1', 'Locus') })
    const b = candidate({
      assetName: 'Pakiet nieruchomości biurowo-gruntowych przy ul. Puławskiej',
      url: 'https://b.example/2',
      announcementDate: '2026-10-05',
      otherParties: agent('https://b.example/2', 'Agencja Nieruchomości Locus'),
    })
    expect(clusterCandidates([a, b])).toHaveLength(1)
    // a different day, or no shared party: still two deals
    const c = { ...b, announcementDate: '2026-10-06' }
    expect(clusterCandidates([a, c])).toHaveLength(2)
    expect(clusterCandidates([a, { ...b, otherParties: [] }])).toHaveLength(2)
  })

  it('re-groups merged deals once deepening made them identical', () => {
    const audit: AuditEntry[] = []
    const one = mergeCandidates(1, [candidate({ assetName: 'drugi etap BOOSTER Zabrze', url: 'https://a.example/1', fields: { seller: ev('LemonTree', 'https://a.example/1') } })], audit)
    const two = mergeCandidates(2, [candidate({ assetName: 'Phase 2 of BOOSTER ZABRZE', url: 'https://b.example/2', fields: { seller: ev('LemonTree', 'https://b.example/2', 1) }, source: { url: 'https://b.example/2', tier: 1, publishedAt: '2026-09-10' } })], audit)
    const groups = clusterMergedDeals([one, two])
    expect(groups).toHaveLength(1)
    const merged = mergeMergedDeals(1, groups[0], audit)
    expect(merged.assetName).toBe('Phase 2 of BOOSTER ZABRZE') // the law firm source names the deal
    expect(merged.assetNames).toContain('drugi etap BOOSTER Zabrze')
    expect(merged.sources.map((s) => s.url).sort()).toEqual(['https://a.example/1', 'https://b.example/2'])
    expect(merged.fields.seller?.[0].tier).toBe(1)
    expect(audit.some((a) => a.reason === 'duplicate_merged')).toBe(true)
  })
})

describe('merge', () => {
  it('prefers the more reliable source and logs the conflict', () => {
    const audit: AuditEntry[] = []
    const press = candidate({ assetName: 'Wisła Tower', url: 'https://press.example/1', fields: { deal_value: ev('EUR 110 million', 'https://press.example/1', 2) } })
    const firm = candidate({
      assetName: 'Wisła Tower',
      url: 'https://firm.example/2',
      source: { url: 'https://firm.example/2', tier: 1, publishedAt: '2026-09-10' },
      fields: { deal_value: ev('EUR 120 million', 'https://firm.example/2', 1) },
    })
    const deal = mergeCandidates(1, [press, firm], audit)
    expect(deal.fields.deal_value?.[0].value).toBe('EUR 120 million')
    expect(audit.some((a) => a.kind === 'conflict' && a.value === 'EUR 110 million')).toBe(true)
  })

  it('moves a firm claimed for both sides to "other"', () => {
    const audit: AuditEntry[] = []
    const a = candidate({ assetName: 'Wisła Tower', url: 'https://a.example/1', fields: { buyer_legal_advisor: ev('Lex Varsovia', 'https://a.example/1') } })
    const b = candidate({ assetName: 'Wisła Tower', url: 'https://b.example/2', fields: { seller_legal_advisor: ev('Lex Varsovia', 'https://b.example/2') } })
    const deal = mergeCandidates(1, [a, b], audit)
    expect(deal.fields.buyer_legal_advisor ?? []).toHaveLength(0)
    expect(deal.fields.seller_legal_advisor ?? []).toHaveLength(0)
    expect(deal.otherAdvisors.map((o) => o.name)).toEqual(['Lex Varsovia'])
  })

  it('takes the earliest stated date', () => {
    const a = candidate({ assetName: 'Wisła Tower', url: 'https://a.example/1', announcementDate: '2026-09-12', dateBasis: 'published' })
    const b = candidate({ assetName: 'Wisła Tower', url: 'https://b.example/2', announcementDate: '2026-09-15', dateBasis: 'quote' })
    expect(mergeCandidates(1, [a, b], []).announcementDate).toBe('2026-09-15')
  })

  it('remembers the oldest trace of the deal, even from an undated report', () => {
    const fresh = candidate({ assetName: 'park handlowy w Nysie', url: 'https://rp.example/results', announcementDate: '2026-09-30', dateBasis: 'quote' })
    const old = candidate({
      assetName: 'park handlowy w Nysie',
      url: 'https://retailnet.example/2026/06/29/nysa',
      announcementDate: null,
      dateBasis: null,
      source: { url: 'https://retailnet.example/2026/06/29/nysa', tier: 2, publishedAt: '2026-06-29' },
    })
    const deal = mergeCandidates(1, [fresh, old], [])
    expect(deal.announcementDate).toBe('2026-09-30')
    expect(deal.earliestDate).toBe('2026-06-29')
  })

  it('enrichment pushes the first appearance back when the follow-up source is older', () => {
    const deal = mergeCandidates(
      1,
      [candidate({ assetName: 'park handlowy w Nysie', url: 'https://rp.example/results', announcementDate: '2026-09-30', dateBasis: 'quote', source: { url: 'https://rp.example/results', tier: 2, publishedAt: '2026-09-30' } })],
      [],
    )
    expect(deal.earliestDate).toBe('2026-09-30')
    const older = candidate({
      assetName: 'park handlowy w Nysie',
      url: 'https://retailnet.example/2026/06/29/nysa',
      announcementDate: '2026-06-29',
      dateBasis: 'published',
      source: { url: 'https://retailnet.example/2026/06/29/nysa', tier: 2, publishedAt: '2026-06-29' },
      fields: { buyer: ev('Tewox AB', 'https://retailnet.example/2026/06/29/nysa') },
    })
    applyEnrichment(deal, older, [])
    expect(deal.earliestDate).toBe('2026-06-29')
    expect(deal.announcementDate).toBe('2026-09-30')
  })

  it('enrichment dates an undated deal from the follow-up, a quoted date beating a published one', () => {
    const undated = candidate({
      assetName: 'Bursztyn Park',
      url: 'https://firm.example/news/2026/october/bursztyn',
      announcementDate: null,
      dateBasis: null,
      source: { url: 'https://firm.example/news/2026/october/bursztyn', tier: 1, publishedAt: null },
    })
    const deal = mergeCandidates(1, [undated], [])
    expect(deal.announcementDate).toBeNull()
    expect(deal.earliestDate).toBe('2026-10-31') // month from the URL bounds the age only
    const published = candidate({ assetName: 'Bursztyn Park', url: 'https://press.example/2', announcementDate: '2026-10-07', dateBasis: 'published', source: { url: 'https://press.example/2', tier: 2, publishedAt: '2026-10-07' } })
    expect(applyEnrichment(deal, published, [])).toContain('announcement_date')
    expect(deal.announcementDate).toBe('2026-10-07')
    expect(deal.sources.map((s) => s.url)).toContain('https://press.example/2')
    const quoted = candidate({ assetName: 'Bursztyn Park', url: 'https://press.example/3', announcementDate: '2026-10-05', dateBasis: 'quote', source: { url: 'https://press.example/3', tier: 2, publishedAt: '2026-10-07' } })
    applyEnrichment(deal, quoted, [])
    expect(deal.announcementDate).toBe('2026-10-05')
    expect(deal.dateBasis).toBe('quote')
    // a later quoted date never overrides an earlier quoted one
    applyEnrichment(deal, { ...quoted, announcementDate: '2026-10-09' }, [])
    expect(deal.announcementDate).toBe('2026-10-05')
  })

  it('enrichment fills only empty fields', () => {
    const audit: AuditEntry[] = []
    const deal = mergeCandidates(1, [candidate({ assetName: 'Wisła Tower', url: 'https://a.example/1', fields: { buyer: ev('Nordhaven Capital', 'https://a.example/1') } })], audit)
    const extra = candidate({
      assetName: 'Wisła Tower',
      url: 'https://firm.example/2',
      fields: { buyer: ev('Someone Else', 'https://firm.example/2'), buyer_legal_advisor: ev('Kowalski & Partners', 'https://firm.example/2', 1) },
    })
    const filled = applyEnrichment(deal, extra, audit)
    expect(filled).toEqual(['buyer_legal_advisor'])
    expect(deal.fields.buyer?.[0].value).toBe('Nordhaven Capital')
    expect(deal.sources.map((s) => s.url)).toContain('https://firm.example/2')
  })
})

describe('gaps and queries', () => {
  const lists = buildDomainLists()
  const base = mergeCandidates(
    1,
    [candidate({ assetName: 'Wisła Tower (32-storey office building), Warsaw', city: 'Warsaw', url: 'https://a.example/1', fields: { buyer: ev('Nordhaven Capital', 'https://a.example/1') } })],
    [],
  )

  it('lists the gaps that apply to the transaction type', () => {
    expect(gapsOf(base)).toEqual(['buyer_legal_advisor', 'seller_legal_advisor', 'deal_value', 'seller'])
    const financing = { ...base, transactionType: 'financing' as const }
    expect(gapsOf(financing)).toEqual(['buyer_legal_advisor', 'deal_value'])
    // a missing date is the most valuable gap: without it the deal is lost
    expect(gapsOf({ ...base, announcementDate: null })[0]).toBe('announcement_date')
  })

  it('caps deepening at the limit, most valuable gaps first', () => {
    const complete = { ...base, id: 2, fields: { ...base.fields, buyer_legal_advisor: [ev('A', 'u')], seller_legal_advisor: [ev('B', 'u')], deal_value: [ev('EUR 1 million', 'u')], seller: [ev('S', 'u')] } }
    const small = { ...base, id: 3, fields: { ...complete.fields, deal_value: [] } }
    expect(planDeepening([base, complete, small], 5).map((p) => p.deal.id)).toEqual([1, 3])
    expect(planDeepening([small, base], 1).map((p) => p.deal.id)).toEqual([1])
  })

  it('does not spend deepening slots on deals nothing can be searched for', () => {
    const vague = { ...base, id: 4, assetName: 'office building in Warsaw', fields: {} }
    expect(planDeepening([vague, base], 1).map((p) => p.deal.id)).toEqual([1])
    expect(planDeepening([vague], 5)).toEqual([])
  })

  it('strips descriptions from the asset name', () => {
    expect(searchableAssetName('The Bridge (40-storey office property)')).toBe('The Bridge')
    expect(searchableAssetName('Wisła Tower, Warsaw')).toBe('Wisła Tower')
  })

  it('always searches law firm sites when an advisor is missing', () => {
    const queries = buildDeepeningQueries(base, gapsOf(base), lists, 4)
    expect(queries).toHaveLength(4)
    expect(queries[0].scope).toBe('law')
    expect(queries[0].includeDomains).toEqual(lists.lawFirms)
    expect(queries[0].query).toBe('"Wisła Tower" Nordhaven Capital advised')
    expect(queries.every((q) => q.query.length <= 390)).toBe(true)
    // every gap gets a query before any gap gets a second one
    expect(new Set(queries.slice(0, 3).map((q) => q.gap)).size).toBe(3)
  })

  it('searches by parties when the asset has no name', () => {
    const unnamed = { ...base, assetName: 'office building in Warsaw', assetNames: ['office building in Warsaw'] }
    const queries = buildDeepeningQueries(unnamed, ['buyer_legal_advisor'], lists, 4)
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every((q) => !q.query.includes('"'))).toBe(true)
    expect(queries.every((q) => q.query.includes('Nordhaven Capital'))).toBe(true)
  })

  it('gives up when there is nothing to search for', () => {
    const nothing = { ...base, assetName: 'office building', assetNames: ['office building'], fields: {} }
    expect(buildDeepeningQueries(nothing, ['buyer_legal_advisor'], lists, 4)).toEqual([])
  })

  it('builds natural-language discovery queries for every lane and scope within the cap', () => {
    const window = { from: '2026-08-30', to: '2026-09-29', days: 30 }
    const queries = buildDiscoveryQueries(window, lists, 48)
    expect(queries.length).toBeGreaterThanOrEqual(40)
    expect(queries.length).toBeLessThanOrEqual(48)
    const pairs = new Set(queries.map((q) => `${q.lane}|${q.scope}`))
    for (const pair of ['sales|web', 'sales|trade', 'financing|web', 'financing|trade', 'lawfirms|web', 'lawfirms|legal-press', 'lawfirms|law']) {
      expect(pairs.has(pair), pair).toBe(true)
    }
    // the date filter does the dating — no month tokens in the queries
    expect(queries.some((q) => /\b20\d\d\b/.test(q.query))).toBe(false)
    expect(queries.every((q) => q.query.length <= TAVILY_MAX_QUERY_CHARS)).toBe(true)
    expect(queries.filter((q) => q.scope === 'web').every((q) => q.topic === 'news' && !q.includeDomains && q.dated)).toBe(true)
    expect(queries.filter((q) => q.scope === 'law').every((q) => (q.includeDomains?.length ?? 0) > 0 && q.includeDomains!.length <= LAW_CHUNK_SIZE && !q.dated)).toBe(true)
    expect(queries.some((q) => q.scope === 'law' && /kancelaria/.test(q.query))).toBe(true)
    expect(new Set(queries.map((q) => `${q.query}|${q.scope}|${(q.includeDomains ?? []).join(',')}`)).size).toBe(queries.length)
    // a small cap still reaches every lane × scope queue
    expect(new Set(buildDiscoveryQueries(window, lists, 7).map((q) => `${q.lane}|${q.scope}`)).size).toBe(7)
  })

  it('skips pages that are never deal reports', () => {
    for (const url of [
      'https://www.gtlaw.com/en/professionals/d/dlugoborski-pawel',
      'https://www.whitecase.com/people/antonio-marin',
      'https://www.wolftheiss.com/lawyer/bartosz-kopik',
      'https://www.dentons.com/en/find-your-dentons-team/practices/real-estate',
      'https://eurobuildcee.com/eurojobs/4153-bert-hesselink',
      'https://eurobuildcee.com/en/magazine/4515-polands-retail-market-picks-up-pace',
      'https://ceelegalmatters.com/partner/lukasz-lanoszka',
      'https://www.property-forum.eu/news/tag/poland',
    ]) {
      expect(isExcludedPath(url), url).toBe(true)
    }
    for (const url of [
      'https://www.whitecase.com/news/press-release/white-case-advises-vestas',
      'https://www.wolftheiss.com/insights/wolf-theiss-advises-lemontree',
      'https://www.dentons.com/en/about-dentons/news-events-and-awards/news/2026/october/dentons-advises-ppg',
      'https://ceelegalmatters.com/countries/poland/eversheds-sutherland-and-dentons-advise',
      'https://www.property-forum.eu/news/hillwood-polska-secures-financing/21587',
    ]) {
      expect(isExcludedPath(url), url).toBe(false)
    }
    const article = { url: 'https://www.gtlaw.com/en/professionals/d/dlugoborski-pawel', title: 'Paweł Długoborski', text: 'x'.repeat(400), publishedAt: null, origin: 'tavily' as const, lane: 'lawfirms' as const }
    const { kept, stats } = prefilterArticles([article], lists, 10)
    expect(kept).toHaveLength(0)
    expect(stats.unusable).toBe(1)
  })
})

describe('table record', () => {
  const deal = mergeCandidates(
    7,
    [
      candidate({
        assetName: 'Wisła Tower',
        city: 'Warsaw',
        url: 'https://a.example/1',
        announcementDate: '2026-09-07',
        fields: {
          buyer: ev('Nordhaven Capital', 'https://a.example/1'),
          seller: ev('Baltic Estates', 'https://a.example/1'),
          deal_value: ev('120 mln euro', 'https://a.example/1'),
          buyer_legal_advisor: ev('Kowalski & Partners', 'https://a.example/1'),
        },
        otherParties: [{ name: 'Bank Hanzeatycki', role: 'lender', quote: 'q', url: 'https://a.example/1', tier: 2 }],
      }),
      candidate({ assetName: 'Wisła Tower', url: 'https://unused.example/2', announcementDate: '2026-09-08' }),
    ],
    [],
  )

  it('has exactly the 14 string keys the table expects', () => {
    const record = toRecord(deal, 'Nordhaven Capital acquired Wisła Tower.')
    expect(Object.keys(record)).toEqual([...TRANSACTION_KEYS])
    expect(Object.values(record).every((v) => typeof v === 'string')).toBe(true)
    expect(record['Data ogłoszenia']).toBe('7.09.2026')
    expect(record['Deal value']).toBe('EUR 120 million')
    expect(record['Other parties involved']).toBe('Bank Hanzeatycki (lender)')
    expect(record['Seller legal advisor']).toBe('')
  })

  it('lists only sources that contributed a verified fact', () => {
    expect(toRecord(deal, 'x')['Źródła informacji']).toBe('https://a.example/1')
  })

  it('rejects descriptions that add names or numbers', () => {
    expect(descriptionSupported('Nordhaven Capital acquired Wisła Tower in Warsaw from Baltic Estates for EUR 120 million.', deal)).toBe(true)
    expect(descriptionSupported('Nordhaven Capital acquired Wisła Tower from Baltic Estates for EUR 150 million.', deal)).toBe(false)
    expect(descriptionSupported('Blackstone acquired Wisła Tower from Baltic Estates.', deal)).toBe(false)
  })

  it('falls back to a sentence built from verified values', () => {
    const sentence = templateDescription(deal)
    expect(sentence).toBe('Nordhaven Capital acquired Wisła Tower from Baltic Estates for EUR 120 million.')
    expect(descriptionSupported(sentence, deal)).toBe(true)
  })
})
