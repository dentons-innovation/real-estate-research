/**
 * Checks the Azure OpenAI deployment: connectivity, API style, strict
 * structured output, and that the evidence check accepts the model's quotes.
 *   npm run probe:llm -w @re/backend
 * Uses one fictional article; costs one or two model calls.
 */
import { createLlmClient } from '../src/clients/llm'
import { buildDomainLists } from '../src/config/domains'
import { loadConfig } from '../src/config/env'
import { extractArticle } from '../src/extraction/extractArticle'
import type { Article, AuditEntry } from '../src/types'

const config = loadConfig({ ...process.env, MOCK_MODE: 'false', ACCESS_PASSWORD: process.env.ACCESS_PASSWORD || 'probe', TAVILY_API_KEY: process.env.TAVILY_API_KEY || 'probe' }, [])
console.log(`Endpoint: ${config.AZURE_OPENAI_ENDPOINT}`)
console.log(`Deployment: ${config.AZURE_OPENAI_DEPLOYMENT} · styl API: ${config.AZURE_OPENAI_API_STYLE} · reasoning: ${config.LLM_REASONING_EFFORT}\n`)

const article: Article = {
  url: 'https://tradepress.example/probe',
  title: 'Nordhaven Capital kupił biurowiec Wisła Tower w Warszawie',
  publishedAt: null,
  origin: 'tavily',
  lane: 'sales',
  text: `Opublikowano 14 września 2026 r. Fundusz Nordhaven Capital kupił warszawski biurowiec Wisła Tower od spółki Baltic Estates. Wartość transakcji wyniosła 120 mln euro. Kupującemu doradzała kancelaria Kowalski & Partners. W transakcji uczestniczyła także kancelaria Lex Varsovia. Budynek oferuje 41 tys. mkw. powierzchni biurowej. W tym samym tygodniu firma Codewave wynajęła 4 tys. mkw. w kompleksie Vistula Office Park w Krakowie.`,
}

const audit: AuditEntry[] = []
const started = Date.now()
try {
  const outcome = await extractArticle(article, createLlmClient(config), { lists: buildDomainLists(), audit })
  console.log(`OK w ${Date.now() - started} ms · transakcje zgłoszone przez model: ${outcome.reported} · po weryfikacji: ${outcome.candidates.length}\n`)
  for (const c of outcome.candidates) {
    console.log(`Transakcja: ${c.assetName} (${c.transactionType}, ${c.sector}, ${c.status}) · data: ${c.announcementDate ?? '-'} [${c.dateBasis ?? '-'}]`)
    for (const [field, e] of Object.entries(c.fields)) console.log(`  ${field}: ${e.value}\n    cytat: ${e.quote}`)
    for (const o of c.otherAdvisors) console.log(`  other_legal_advisor: ${o.name} (${o.role || 'strona nieokreślona'})`)
  }
  console.log('\nOdrzucone przez weryfikację:')
  for (const a of audit) console.log(`  [${a.kind}/${a.reason}] ${a.deal}${a.field ? ` · ${a.field}: ${a.value}` : ''}`)
  if (audit.length === 0) console.log('  (nic)')

  console.log('\nOczekiwany wynik: 1 transakcja (Wisła Tower), kupujący Nordhaven Capital, sprzedający Baltic Estates,')
  console.log('wartość 120 mln euro, doradca kupującego Kowalski & Partners, Lex Varsovia w "other", najem Vistula Office Park odrzucony.')
} catch (err) {
  console.error(`BŁĄD po ${Date.now() - started} ms: ${err instanceof Error ? err.message : String(err)}`)
  console.error('Sprawdź AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT i AZURE_OPENAI_API_STYLE (responses | chat | azure-legacy).')
  process.exit(1)
}
