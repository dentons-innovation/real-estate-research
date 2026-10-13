/**
 * Runs the real discovery query generator against Tavily and prints what every
 * query finds, so query quality can be judged without a full research run.
 *   npm run probe:queries -w @re/backend
 * Costs about as many search credits as a research run's discovery phase.
 */
import { createTavilyClient } from '../src/clients/tavily'
import { buildDomainLists, hostOf } from '../src/config/domains'
import { loadConfig } from '../src/config/env'
import { resolveWindow } from '../src/deals/dates'
import { isExcludedPath } from '../src/extraction/articleText'
import { buildDiscoveryQueries } from '../src/queries/discoveryQueries'

const config = loadConfig({ ...process.env, MOCK_MODE: 'true', ALLOW_NO_AUTH: 'true' }, [])
if (!config.TAVILY_API_KEY) {
  console.error('Brak TAVILY_API_KEY w środowisku.')
  process.exit(1)
}
const tavily = createTavilyClient(config)
const lists = buildDomainLists(config.EXTRA_TRADE_DOMAINS, config.EXTRA_LAW_DOMAINS)
const window = resolveWindow({}, { defaultDays: config.DEFAULT_RANGE_DAYS, maxDays: config.MAX_RANGE_DAYS })
const queries = buildDiscoveryQueries(window, lists, 100)

console.log(`Okno: ${window.from} – ${window.to} · zapytań: ${queries.length} (limit w konfiguracji: ${config.TAVILY_MAX_DISCOVERY_QUERIES})\n`)

const seenHosts = new Set<string>()
let total = 0
for (const q of queries) {
  try {
    const results = await tavily.search({
      query: q.query,
      topic: q.topic,
      includeDomains: q.includeDomains,
      excludeDomains: q.includeDomains ? undefined : lists.excluded,
      startDate: q.dated ? window.from : undefined,
      endDate: q.dated ? window.to : undefined,
      maxResults: q.scope === 'web' ? 20 : 15,
      rawContent: false,
      purpose: 'discovery',
    })
    const usable = results.filter((r) => !isExcludedPath(r.url))
    const hosts = [...new Set(usable.map((r) => hostOf(r.url)))]
    hosts.forEach((h) => seenHosts.add(h))
    total += usable.length
    const domains = q.includeDomains ? ` [${q.includeDomains.length} domen]` : ''
    console.log(`[${q.lane}/${q.scope}${domains}] ${q.query}`)
    console.log(`  wyniki: ${results.length} · użyteczne: ${usable.length} · z datą: ${usable.filter((r) => r.publishedAt).length} · wykluczone ścieżki: ${results.length - usable.length}`)
    console.log(`  serwisy: ${hosts.join(', ') || '-'}`)
  } catch (err) {
    console.log(`[${q.lane}/${q.scope}] ${q.query}\n  BŁĄD: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const silent = (domains: string[]) => domains.filter((d) => ![...seenHosts].some((h) => h === d || h.endsWith(`.${d}`)))
console.log(`\nŁącznie użytecznych wyników: ${total}`)
console.log('Serwisy z list, które nie zwróciły żadnego wyniku:')
console.log(`  prasa branżowa: ${silent(lists.tradePress).join(', ') || '-'}`)
console.log(`  kancelarie:     ${silent(lists.lawFirms).join(', ') || '-'}`)
console.log(`  prasa prawnicza: ${silent(lists.legalPress).join(', ') || '-'}`)
