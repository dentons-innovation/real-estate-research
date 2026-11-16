import { BACKEND_PHASE_IDS, TRANSACTION_KEYS, type ProgressEvent } from '@re/shared'
import { describe, expect, it } from 'vitest'
import { createMockClients, type MockOptions } from '../src/clients/mock/mockClients'
import { buildDomainLists } from '../src/config/domains'
import type { PipelineContext } from '../src/pipeline/context'
import { runResearch } from '../src/pipeline/orchestrator'
import { verifyExtractedDeal } from '../src/extraction/extractArticle'
import type { ExtractedDeal } from '../src/extraction/schema'
import type { Article, AuditEntry } from '../src/types'
import { prepareText } from '../src/verify/evidence'

const WINDOW = { from: '2026-08-30', to: '2026-09-29', days: 30 }

/** Same end date, 180 days back: the fixture deal closed 100 days before the end falls inside. */
const HALF_YEAR = { from: '2026-04-02', to: '2026-09-29', days: 180 }

async function run(options: MockOptions = {}, overrides: Partial<PipelineContext['settings']> = {}, window = WINDOW) {
  const clients = createMockClients(0, options)
  const events: ProgressEvent[] = []
  const audit: AuditEntry[] = []
  const outcome = await runResearch({
    window,
    lists: buildDomainLists(),
    opoint: clients.opoint,
    tavily: clients.tavily,
    llm: clients.llm,
    emit: (e) => events.push(e),
    signal: new AbortController().signal,
    audit,
    settings: {
      maxDiscoveryQueries: 24,
      maxArticlesForExtraction: 120,
      deepenLimit: 15,
      maxQueriesPerDeal: 4,
      maxNewSourcesPerDeal: 4,
      deepenConcurrency: 3,
      strictWindow: true, maxDealAgeDays: 60,
      ...overrides,
    },
  })
  const byAsset = (name: string) => outcome.result.transactions.find((t) => t['Deal/asset'].includes(name))
  return { outcome, events, audit, byAsset }
}

describe('research pipeline (mock clients)', () => {
  it('produces the expected table', async () => {
    const { outcome, byAsset } = await run()
    const rows = outcome.result.transactions
    expect(rows.map((r) => r['Deal/asset']).sort()).toEqual(['Bursztyn Park, Gdańsk', 'Galeria Bursztynowa, Gdańsk', 'Logistic Hub Stryków', 'Wisła Tower'])
    for (const row of rows) {
      expect(Object.keys(row)).toEqual([...TRANSACTION_KEYS])
      expect(row['Źródła informacji']).toMatch(/^https:\/\//)
      expect(row['Data ogłoszenia']).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    }
    expect(outcome.result.meta.opoint_used).toBe(true)

    const tower = byAsset('Wisła Tower')!
    expect(tower['Buyer / inwestor']).toBe('Nordhaven Capital')
    expect(tower['Seller / vendor']).toBe('Baltic Estates')
    expect(tower['Deal value']).toBe('EUR 120 million')
  })

  it('merges duplicate reports into one deal with both sources', async () => {
    const { byAsset } = await run()
    const sources = byAsset('Wisła Tower')!['Źródła informacji'].split('; ')
    expect(sources).toContain('https://tradepress.example/news/nordhaven-acquires-wisla-tower')
    expect(sources).toContain('https://monitoring.example/artykul/wisla-tower-sprzedana')
  })

  it('fills missing advisors in the deepening phase', async () => {
    const { byAsset } = await run()
    const tower = byAsset('Wisła Tower')!
    expect(tower['Buyer legal advisor']).toBe('Kowalski & Partners')
    expect(tower['Seller legal advisor']).toBe('Lex Varsovia')
    expect(tower['Źródła informacji']).toContain('https://kowalskipartners.example/news/wisla-tower-acquisition')
  })

  it('rejects an advisor the model made up', async () => {
    const { byAsset, audit } = await run()
    const galeria = byAsset('Galeria Bursztynowa')!
    expect(galeria['Buyer legal advisor']).toBe('')
    expect(JSON.stringify(galeria)).not.toContain('Meridian')
    expect(audit.some((a) => a.kind === 'field_rejected' && a.value === 'Meridian Legal' && a.reason === 'quote_not_found')).toBe(true)
  })

  it('does not guess which side a law firm advised', async () => {
    const { byAsset, audit } = await run()
    const hub = byAsset('Logistic Hub')!
    expect(hub['Seller legal advisor']).toBe('Lex Varsovia')
    expect(hub['Buyer legal advisor']).toBe('')
    expect(hub['Other legal advisors involved']).toContain('Kowalski & Partners')
    expect(audit.some((a) => a.kind === 'field_demoted' && a.value === 'Kowalski & Partners')).toBe(true)
  })

  it('drops leases and deals outside the window', async () => {
    const { outcome, audit } = await run()
    const text = JSON.stringify(outcome.result.transactions)
    expect(text).not.toContain('Vistula Office Park')
    expect(text).not.toContain('Hotel Sudecki')
    expect(audit.some((a) => a.kind === 'deal_dropped' && a.reason === 'lease_only')).toBe(true)
    expect(audit.some((a) => a.kind === 'deal_dropped' && a.reason === 'outside_window')).toBe(true)
  })

  it('keeps an older deal when the window is long enough to contain it', async () => {
    const { outcome, audit, byAsset } = await run({}, {}, HALF_YEAR)
    // closed 100 days before the window end: outside 30 days, inside 180 — and not cut by the 60-day age limit
    const hotel = byAsset('Hotel Sudecki')!
    expect(hotel).toBeDefined()
    expect(hotel['Data ogłoszenia']).toBe('21.06.2026')
    expect(hotel['Buyer / inwestor']).toBe('Helios Hospitality')
    expect(audit.some((a) => a.kind === 'deal_dropped' && (a.reason === 'too_old' || a.reason === 'outside_window'))).toBe(false)
    expect(outcome.result.meta.window).toEqual(HALF_YEAR)
    // the deals of the last month are all still there
    expect(outcome.result.transactions.map((r) => r['Deal/asset']).sort()).toEqual([
      'Bursztyn Park, Gdańsk',
      'Galeria Bursztynowa, Gdańsk',
      'Hotel Sudecki, Wrocław',
      'Logistic Hub Stryków',
      'Wisła Tower',
    ])
  })

  it('does not take the year of a date from the model in a long window', () => {
    // the article says "7 lipca" without a year; the model answers 2026-07-07
    const extracted: ExtractedDeal = {
      asset_name: 'Odra Business Park',
      asset_quote: 'Fundusz Arcturus Real Estate kupił biurowiec Odra Business Park we Wrocławiu.',
      city: 'Wrocław',
      in_poland: true,
      is_lease_only: false,
      is_market_report: false,
      transaction_type: 'acquisition',
      description_en: 'Arcturus Real Estate acquired Odra Business Park in Wrocław.',
      announcement_date: '2026-07-07',
      announcement_date_quote: 'Umowę sprzedaży podpisano 7 lipca.',
      buyer: null,
      seller: null,
      other_parties: [],
      deal_value: null,
      buyer_legal_advisor: null,
      seller_legal_advisor: null,
      other_legal_advisors: [],
      status: 'signed',
      sector: 'office',
    }
    const verify = (publishedAt: string | null, longWindow: boolean) => {
      const article: Article = {
        url: 'https://tradepress.example/news/odra-business-park',
        title: 'Arcturus kupił Odra Business Park',
        text: 'Fundusz Arcturus Real Estate kupił biurowiec Odra Business Park we Wrocławiu. Umowę sprzedaży podpisano 7 lipca. Budynek oferuje 20 tys. mkw. powierzchni.',
        publishedAt,
        origin: 'tavily',
        lane: 'sales',
      }
      const audit: AuditEntry[] = []
      const candidate = verifyExtractedDeal(extracted, article, prepareText(`${article.title}\n${article.text}`), { lists: buildDomainLists(), audit, longWindow })!
      return { candidate, audit }
    }

    // published a few days later in the same year: the date stands
    expect(verify('2026-07-10', true).candidate).toMatchObject({ announcementDate: '2026-07-07', dateBasis: 'quote' })

    // the article is a year old: "7 lipca" is not July 2026 — the publication date is used instead
    const old = verify('2025-07-10', true)
    expect(old.candidate).toMatchObject({ announcementDate: '2025-07-10', dateBasis: 'published' })
    expect(old.audit.some((a) => a.kind === 'field_rejected' && a.field === 'announcement_date' && a.value === '2026-07-07')).toBe(true)

    // an undated page cannot confirm the year: the deal stays undated and goes to deepening
    expect(verify(null, true).candidate).toMatchObject({ announcementDate: null, dateBasis: null })

    // one-month window: behaviour unchanged, the stated date is accepted as before
    expect(verify(null, false).candidate).toMatchObject({ announcementDate: '2026-07-07', dateBasis: 'quote' })
    expect(verify('2025-07-10', false).candidate).toMatchObject({ announcementDate: '2026-07-07', dateBasis: 'quote' })
  })

  it('dates a deal found on an undated page from its follow-up article', async () => {
    const { byAsset, events } = await run()
    const park = byAsset('Bursztyn Park')!
    expect(park).toBeDefined()
    expect(park['Data ogłoszenia']).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    expect(park['Buyer / inwestor']).toBe('Nordsee Invest')
    expect(park['Seller legal advisor']).toBe('Lex Varsovia')
    expect(park['Deal value']).toBe('EUR 38 million')
    expect(park['Źródła informacji']).toContain('https://tradepress.example/news/nordsee-invest-kupuje-bursztyn-park')
    expect(events.some((e) => e.message.includes('Bursztyn Park') && e.phase_id === 'deepening')).toBe(true)
  })

  it('drops an undated deal only after deepening failed to date it', async () => {
    const { outcome, audit, events } = await run()
    expect(JSON.stringify(outcome.result.transactions)).not.toContain('Magnolia Office')
    expect(audit.some((a) => a.kind === 'deal_dropped' && a.reason === 'no_date' && a.deal.includes('Magnolia Office'))).toBe(true)
    // it was given its chance: a deepening step ran for it before the drop
    expect(events.some((e) => e.phase_id === 'deepening' && e.message.includes('Magnolia Office'))).toBe(true)
  })

  it('records the evidence behind every filled field', async () => {
    const { outcome } = await run()
    const tower = outcome.audit.deals.find((d) => d.asset === 'Wisła Tower')!
    expect(tower.fields.buyer_legal_advisor).toEqual({
      value: 'Kowalski & Partners',
      quote: 'Kowalski & Partners advised Nordhaven Capital, the buyer, on the acquisition of Wisła Tower in Warsaw.',
      url: 'https://kowalskipartners.example/news/wisla-tower-acquisition',
    })
  })

  it('emits a valid, monotonic phase sequence', async () => {
    const { events } = await run()
    const order = (id: string) => BACKEND_PHASE_IDS.indexOf(id as (typeof BACKEND_PHASE_IDS)[number])
    const phases = events.filter((e) => e.phase_id).map((e) => e.phase_id as string)
    expect(phases.every((p) => order(p) >= 0)).toBe(true)
    for (let i = 1; i < phases.length; i++) expect(order(phases[i])).toBeGreaterThanOrEqual(order(phases[i - 1]))
    expect(phases[0]).toBe('init')
    expect(phases[phases.length - 1]).toBe('done')
    for (const id of ['research_launch', 'dedup', 'gap_analysis', 'deepening', 'compile']) expect(phases).toContain(id)

    const progress = events.filter((e) => e.phase_id === 'deepening').map((e) => e.progress ?? 0)
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1])
    expect(progress[progress.length - 1]).toBe(1)
    // events must never look like the final payload to the frontend parser
    for (const e of events) {
      expect(e).not.toHaveProperty('transactions')
      expect(e).not.toHaveProperty('content')
      expect(typeof e.message).toBe('string')
    }
  })

  it('continues on Tavily when Opoint fails', async () => {
    const { outcome, events } = await run({ failOpoint: true })
    expect(outcome.result.meta.opoint_used).toBe(false)
    expect(events.some((e) => e.message.startsWith('Opoint niedostępny'))).toBe(true)
    expect(outcome.result.transactions.map((r) => r['Deal/asset'])).toContain('Wisła Tower, Warsaw')
  })

  it('returns an empty table, not an error, when nothing is found', async () => {
    const { outcome, events } = await run({ extractionFor: () => ({ is_relevant: false, deals: [] }) })
    expect(outcome.result.transactions).toEqual([])
    expect(events[events.length - 1].phase_id).toBe('done')
  })

  it('stops when aborted', async () => {
    const clients = createMockClients(0.05)
    const controller = new AbortController()
    const promise = runResearch({
      window: WINDOW,
      lists: buildDomainLists(),
      ...clients,
      emit: () => {},
      signal: controller.signal,
      audit: [],
      settings: { maxDiscoveryQueries: 24, maxArticlesForExtraction: 120, deepenLimit: 15, maxQueriesPerDeal: 4, maxNewSourcesPerDeal: 4, deepenConcurrency: 3, strictWindow: true, maxDealAgeDays: 60 },
    })
    setTimeout(() => controller.abort(), 20)
    await expect(promise).rejects.toThrow()
  })
})
