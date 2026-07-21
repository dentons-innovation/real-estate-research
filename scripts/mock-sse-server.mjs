/**
 * Dev-owy mock backendu SSE — do szybkiej iteracji nad frontendem bez n8n.
 *
 * Streamuje NDJSON z pełnym protokołem Mapy Misji (10 faz + finalna tablica)
 * w ~25 s, dokładnie w formacie workflow "Poland RE Deals - Live Research SSE".
 *
 * Użycie:
 *   node scripts/mock-sse-server.mjs
 *   # w .env.local na czas testu:
 *   # VITE_N8N_SSE_WEBHOOK_URL=http://localhost:5678/webhook/research-sse
 */
import http from 'node:http'

const PORT = 5678

/** [event, opóźnienie przed KOLEJNYM eventem w ms] */
const EVENTS = [
  [{ phase_id: 'init', phase: 'Inicjalizacja', message: 'Połączono z backendem — rozpoczynam deep research rynku nieruchomości w Polsce (okno: ostatnie 30 dni)...' }, 1200],
  [{ phase_id: 'research_launch', phase: 'Start researchu', message: 'Uruchamiam 3 równoległe zadania deep research: sprzedaże i przejęcia · finansowania, refinansowania i JV · komunikaty kancelarii prawnych...', total: 3 }, 1600],
  [{ phase_id: 'research_1', phase: 'Deep research', message: 'Deep research w toku — ukończono 0 z 3 zadań badawczych. Kolejne sprawdzenie za 30 sekund...', completed: 0, total: 3, done_labels: '' }, 2200],
  [{ phase_id: 'research_1', phase: 'Deep research', message: 'Deep research w toku — ukończono 0 z 3 zadań badawczych. Kolejne sprawdzenie za 30 sekund...', completed: 0, total: 3, done_labels: '' }, 2200],
  [{ phase_id: 'research_2', phase: 'Deep research', message: 'Deep research w toku — ukończono 1 z 3 zadań badawczych (finansowania i JV). Kolejne sprawdzenie za 30 sekund...', completed: 1, total: 3, done_labels: 'finansowania i JV' }, 2200],
  [{ phase_id: 'research_3', phase: 'Deep research', message: 'Deep research w toku — ukończono 2 z 3 zadań badawczych (sprzedaże i przejęcia, finansowania i JV). Kolejne sprawdzenie za 30 sekund...', completed: 2, total: 3, done_labels: 'sprzedaże i przejęcia, finansowania i JV' }, 2200],
  [{ phase_id: 'dedup', phase: 'Scalanie wyników', message: 'Research zakończony — po scaleniu duplikatów mam 3 unikalnych transakcji. Sprawdzam kompletność danych...', deals_total: 3 }, 1800],
  [{ phase_id: 'gap_analysis', phase: 'Analiza braków', message: '2 z 3 transakcji ma braki w danych (doradcy prawni, wartość, daty) — pogłębiam je jedna po drugiej...', deepen_total: 2, deals_total: 3 }, 1800],
  [{ phase_id: 'deepening', phase: 'Pogłębianie', message: 'Pogłębiam transakcję 1 z 2: The Bridge (40-storey office property) — planuję zapytania uzupełniające...', progress: 0, deal: 'The Bridge (40-storey office property)', deal_index: 1, deal_total: 2 }, 1800],
  [{ phase_id: 'deepening', phase: 'Pogłębianie', message: 'Pobieram treść 4 nowych źródeł dla: The Bridge (40-storey office property)...', progress: 0.17, deal: 'The Bridge (40-storey office property)', deal_index: 1, deal_total: 2, sources: 4 }, 1800],
  [{ phase_id: 'deepening', phase: 'Pogłębianie', message: 'Analizuję pobrane artykuły (LLM uzupełnia tylko brakujące pola): The Bridge (40-storey office property)...', progress: 0.335, deal: 'The Bridge (40-storey office property)', deal_index: 1, deal_total: 2 }, 2000],
  [{ phase_id: 'deepening', phase: 'Pogłębianie', message: 'Pogłębiam transakcję 2 z 2: Elektrownia Powiśle — planuję zapytania uzupełniające...', progress: 0.5, deal: 'Elektrownia Powiśle', deal_index: 2, deal_total: 2 }, 1800],
  [{ phase_id: 'deepening', phase: 'Pogłębianie', message: 'Pobieram treść 3 nowych źródeł dla: Elektrownia Powiśle...', progress: 0.67, deal: 'Elektrownia Powiśle', deal_index: 2, deal_total: 2, sources: 3 }, 1800],
  [{ phase_id: 'deepening', phase: 'Pogłębianie', message: 'Analizuję pobrane artykuły (LLM uzupełnia tylko brakujące pola): Elektrownia Powiśle...', progress: 0.835, deal: 'Elektrownia Powiśle', deal_index: 2, deal_total: 2 }, 2000],
  [{ phase_id: 'compile', phase: 'Kompilacja', message: 'Kompiluję ostateczną tabelę transakcji i źródła informacji...' }, 1600],
  [{ phase_id: 'done', phase: 'Zakończono', message: 'Gotowe — 3 transakcji w finalnej tabeli. Przesyłam wyniki...' }, 1400],
]

const FINAL_TRANSACTIONS = [
  {
    'Data ogłoszenia': '7.07.2026',
    'Deal/asset': 'The Bridge (40-storey office property)',
    'Rodzaj transakcji': 'single building acquisition (agreement to acquire)',
    'Opis transakcji':
      'Eastnine AB entered into an agreement with Ghelamco to acquire The Bridge office property in Warsaw at an underlying property value of EUR 300 million; the transaction is subject to financing and expected to close in Q4 2026.',
    'Buyer / inwestor': 'Eastnine AB',
    'Seller / vendor': 'Ghelamco',
    'Other parties involved': 'not disclosed',
    'Deal value': 'EUR 300 million',
    'Buyer legal advisor': 'not disclosed',
    'Seller legal advisor': 'not disclosed',
    'Other legal advisors involved': 'not disclosed',
    'Status transakcji': 'signed',
    'Sektor': 'office',
    'Źródła informacji':
      'https://eurobuildcee.com/en/news/36772-eastnine-acquires-the-bridge-in-warsaw; https://www.eastnine.com/en/press/eastnine-acquires-bridge-warsaw-2467337',
  },
  {
    'Data ogłoszenia': '1.07.2026',
    'Deal/asset': 'Elektrownia Powiśle',
    'Rodzaj transakcji': 'refinancing',
    'Opis transakcji':
      'Erste Group and Erste Bank Polska jointly provided a €172 million refinancing facility for Elektrownia Powiśle, a mixed-use development in Warsaw.',
    'Buyer / inwestor': 'not disclosed',
    'Seller / vendor': 'not disclosed',
    'Other parties involved': 'Tristan Capital Partners; White Star Real Estate; Erste Group; Erste Bank Polska',
    'Deal value': '€172 million',
    'Buyer legal advisor': 'Pinsent Masons',
    'Seller legal advisor': 'CMS',
    'Other legal advisors involved': 'not disclosed',
    'Status transakcji': 'completed',
    'Sektor': 'mixed-use',
    'Źródła informacji':
      'https://news.europawire.eu/e172-million-financing; https://cms.law/en/pol/news-information/cms-advises-erste-group',
  },
  {
    'Data ogłoszenia': '22.06.2026',
    'Deal/asset': 'WITA mixed-use development in Kraków',
    'Rodzaj transakcji': 'financing',
    'Opis transakcji':
      'Echo Investment secured a financing package comprising a five-year construction and investment loan and a VAT facility with a total value of €36.4 million for the WITA mixed-use development in Kraków, provided by Bank Pekao.',
    'Buyer / inwestor': 'not disclosed',
    'Seller / vendor': 'not disclosed',
    'Other parties involved': 'not disclosed',
    'Deal value': '€36.4 million',
    'Buyer legal advisor': 'not disclosed',
    'Seller legal advisor': 'not disclosed',
    'Other legal advisors involved': 'not disclosed',
    'Status transakcji': 'secured',
    'Sektor': 'mixed-use',
    'Źródła informacji': 'https://property-forum.eu/news/echo-receives-construction-loan; https://en.echo.com.pl/news',
  },
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  if (req.method !== 'POST' || !req.url.startsWith('/webhook/research-sse')) {
    res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not found — POST /webhook/research-sse')
    return
  }

  console.log(`[${new Date().toLocaleTimeString()}] research start (${req.socket.remoteAddress})`)
  res.writeHead(200, {
    ...CORS,
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  let timer = null
  let i = 0
  const tick = () => {
    if (res.writableEnded) return
    if (i < EVENTS.length) {
      const [body, delay] = EVENTS[i]
      res.write(JSON.stringify(body) + '\n')
      console.log(`  → ${body.phase_id}${body.progress !== undefined ? ` (${body.progress})` : ''}`)
      i += 1
      timer = setTimeout(tick, delay)
    } else {
      res.write(JSON.stringify(FINAL_TRANSACTIONS) + '\n')
      res.end()
      console.log('  → final payload, stream closed')
    }
  }
  res.on('close', () => {
    if (timer) clearTimeout(timer)
  })
  tick()
})

server.listen(PORT, () => {
  console.log(`Mock SSE server: POST http://localhost:${PORT}/webhook/research-sse`)
  console.log('Ustaw VITE_N8N_SSE_WEBHOOK_URL na powyższy adres i odpal npm run dev.')
})
