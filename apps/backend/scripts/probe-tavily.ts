/**
 * Checks the Tavily key and which source sites actually return results.
 *   npm run probe:tavily -w @re/backend
 * Costs roughly 8 search credits.
 */
import { createTavilyClient } from '../src/clients/tavily'
import { buildDomainLists, hostOf } from '../src/config/domains'
import { loadConfig } from '../src/config/env'
import { resolveWindow } from '../src/deals/dates'

const config = loadConfig({ ...process.env, MOCK_MODE: 'true', ALLOW_NO_AUTH: 'true' }, [])
if (!config.TAVILY_API_KEY) {
  console.error('Brak TAVILY_API_KEY w środowisku.')
  process.exit(1)
}
const tavily = createTavilyClient(config)
const lists = buildDomainLists(config.EXTRA_TRADE_DOMAINS, config.EXTRA_LAW_DOMAINS)
const window = resolveWindow({}, { defaultDays: config.DEFAULT_RANGE_DAYS, maxDays: config.MAX_RANGE_DAYS })

const probes: Array<{ name: string; query: string; topic: 'news' | 'general'; domains?: string[]; dated: boolean }> = [
  { name: 'open web · news · PL', query: 'sprzedaż biurowca transakcja inwestycyjna Polska', topic: 'news', dated: true },
  { name: 'open web · news · EN', query: 'office building acquisition Poland investor acquires', topic: 'news', dated: true },
  { name: 'trade press · PL', query: 'sprzedaż nieruchomości komercyjnej transakcja nabywca', topic: 'general', domains: lists.tradePress, dated: true },
  { name: 'trade press · EN', query: 'real estate acquisition Poland sold investor', topic: 'general', domains: lists.tradePress, dated: true },
  { name: 'law firms · EN', query: 'advised on acquisition sale of real estate in Poland', topic: 'general', domains: lists.lawFirms, dated: true },
  { name: 'law firms · PL', query: 'kancelaria doradzała przy sprzedaży nabyciu nieruchomości', topic: 'general', domains: lists.lawFirms, dated: true },
  { name: 'law firms · undated', query: 'advised on acquisition sale of real estate in Poland', topic: 'general', domains: lists.lawFirms, dated: false },
  { name: 'legal press', query: 'advised real estate transaction Poland', topic: 'general', domains: lists.legalPress, dated: true },
]

const seenHosts = new Set<string>()
for (const p of probes) {
  try {
    const results = await tavily.search({
      query: p.query,
      topic: p.topic,
      includeDomains: p.domains,
      startDate: p.dated ? window.from : undefined,
      endDate: p.dated ? window.to : undefined,
      maxResults: 15,
      rawContent: true,
    })
    const hosts = [...new Set(results.map((r) => hostOf(r.url)))]
    hosts.forEach((h) => seenHosts.add(h))
    console.log(`[${p.name}] wyniki: ${results.length} · z pełnym tekstem: ${results.filter((r) => r.rawContent).length} · z datą: ${results.filter((r) => r.publishedAt).length}`)
    console.log(`  serwisy: ${hosts.join(', ') || '-'}`)
  } catch (err) {
    console.log(`[${p.name}] BŁĄD: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const silent = (domains: string[]) => domains.filter((d) => ![...seenHosts].some((h) => h === d || h.endsWith(`.${d}`)))
console.log('\nSerwisy z list, które nie zwróciły żadnego wyniku (kandydaci do usunięcia lub sprawdzenia):')
console.log(`  prasa branżowa: ${silent(lists.tradePress).join(', ') || '-'}`)
console.log(`  kancelarie:     ${silent(lists.lawFirms).join(', ') || '-'}`)
console.log(`  prasa prawnicza: ${silent(lists.legalPress).join(', ') || '-'}`)
console.log('\nJeśli wyniki z prasy branżowej nie mają dat, a STRICT_WINDOW=true, data transakcji musi być zapisana w treści artykułu.')
