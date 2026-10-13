/**
 * Checks what the Opoint key can do, before the pipeline depends on it.
 *   npm run probe:opoint -w @re/backend
 * Reads OPOINT_TOKEN, OPOINT_STORED_SEARCH_ID, OPOINT_BASE_URL from apps/backend/.env.
 * Prints counts and field presence only — no article text.
 */
import { createOpointClient } from '../src/clients/opoint'
import { loadConfig, type AppConfig } from '../src/config/env'
import { resolveWindow } from '../src/deals/dates'

const base = loadConfig({ ...process.env, MOCK_MODE: 'true', ALLOW_NO_AUTH: 'true' }, [])
if (!base.OPOINT_TOKEN) {
  console.error('Brak OPOINT_TOKEN w środowisku.')
  process.exit(1)
}
const window = resolveWindow({}, { defaultDays: base.DEFAULT_RANGE_DAYS, maxDays: base.MAX_RANGE_DAYS })
console.log(`Okno: ${window.from} – ${window.to} · stored search id: ${base.OPOINT_STORED_SEARCH_ID || '(brak)'}\n`)

const modes: AppConfig['OPOINT_MODE'][] = base.OPOINT_STORED_SEARCH_ID ? ['search_profile', 'feed', 'query'] : ['query', 'feed']

for (const mode of modes) {
  const client = createOpointClient({ ...base, OPOINT_MODE: mode, OPOINT_MAX_ARTICLES: 100, OPOINT_EXTRA_QUERY_ENABLED: false })
  const started = Date.now()
  try {
    const result = await client.fetchArticles(window)
    const a = result.articles
    const dates = a.map((x) => x.publishedAt).filter((d): d is string => !!d).sort()
    const lengths = a.map((x) => x.text.length).sort((x, y) => x - y)
    console.log(`[${mode}] OK w ${Date.now() - started} ms`)
    console.log(`  artykuły: ${a.length}`)
    console.log(`  z datą: ${dates.length} (${dates[0] ?? '-'} … ${dates[dates.length - 1] ?? '-'})`)
    console.log(`  w oknie: ${dates.filter((d) => d >= window.from && d <= window.to).length}`)
    console.log(`  z tekstem > 500 znaków: ${lengths.filter((l) => l > 500).length} (mediana długości: ${lengths[Math.floor(lengths.length / 2)] ?? 0})`)
    console.log(`  języki: ${[...new Set(a.map((x) => x.language ?? '?'))].join(', ') || '-'}`)
    for (const w of result.warnings) console.log(`  ostrzeżenie: ${w}`)
  } catch (err) {
    console.log(`[${mode}] BŁĄD: ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log()
}
console.log('Ustaw OPOINT_MODE na tryb, który zwrócił najwięcej artykułów w oknie (albo zostaw auto).')
