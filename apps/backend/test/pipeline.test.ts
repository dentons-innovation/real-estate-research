import { BACKEND_PHASE_IDS, TRANSACTION_KEYS, type ProgressEvent } from '@re/shared'
import { describe, expect, it } from 'vitest'
import { createMockClients, type MockOptions } from '../src/clients/mock/mockClients'
import { buildDomainLists } from '../src/config/domains'
import type { PipelineContext } from '../src/pipeline/context'
import { runResearch } from '../src/pipeline/orchestrator'
import type { AuditEntry } from '../src/types'

const WINDOW = { from: '2026-08-30', to: '2026-09-29', days: 30 }

async function run(options: MockOptions = {}, overrides: Partial<PipelineContext['settings']> = {}) {
  const clients = createMockClients(0, options)
  const events: ProgressEvent[] = []
  const audit: AuditEntry[] = []
  const outcome = await runResearch({
    window: WINDOW,
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
      expect(row['Data ogłoszenia']).toMatch(/^\d{1,2}\.\d{2}\.\d{4}$/)
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

  it('dates a deal found on an undated page from its follow-up article', async () => {
    const { byAsset, events } = await run()
    const park = byAsset('Bursztyn Park')!
    expect(park).toBeDefined()
    expect(park['Data ogłoszenia']).toMatch(/^\d{1,2}\.\d{2}\.\d{4}$/)
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
