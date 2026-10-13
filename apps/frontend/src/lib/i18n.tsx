import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * App bilingualism (PL/EN).
 *
 * The backend always streams its messages in Polish. English versions are
 * reproduced on the frontend at RENDER time (translateBackendText matches the
 * known message templates), so the language switch also translates entries
 * already sitting in the console. The templates live in
 * apps/backend/src/pipeline/messages.ts — change the wording in both places.
 */

export type Lang = 'pl' | 'en'

/** Text in both languages — phase labels, table columns etc. */
export interface Localized {
  pl: string
  en: string
}

const LANG_KEY = 'dentons-re-lang'

interface LangContextValue {
  lang: Lang
  toggle: () => void
  setLang: (lang: Lang) => void
}

const LangContext = createContext<LangContextValue>({ lang: 'pl', toggle: () => {}, setLang: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'pl'))
  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(LANG_KEY, next)
    setLangState(next)
  }, [])
  const toggle = useCallback(() => {
    setLangState((prev) => {
      const next: Lang = prev === 'pl' ? 'en' : 'pl'
      localStorage.setItem(LANG_KEY, next)
      return next
    })
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return <LangContext.Provider value={{ lang, toggle, setLang }}>{children}</LangContext.Provider>
}

export interface UIStrings {
  // Sidebar
  brandTagline: string
  interfaceSection: string
  avatarToggle: string
  avatarHint: string
  langLabel: string
  // Sources (Opoint plug-in switch)
  sourcesSection: string
  opointToggle: string
  opointHint: string
  opointHintOn: string
  /** Toast shown when the switch is flipped while the backend reports Opoint as switched off. */
  opointUnavailable: string
  /** Same toast when the backend has no Opoint token at all. */
  opointNotConfigured: string
  stopResearch: string
  mockError: string
  stopping: string
  tryAgain: string
  startResearch: string
  // App header
  headerTools: string
  headerResearch: string
  dateLocale: string
  // Idle
  idleEyebrow: string
  idleTitlePre: string
  idleTitleAccent: string
  idleDescription: string
  idleCapabilities: string[]
  idleHintPre: string
  idleHintButton: string
  // Searching / mission
  missionFailed: string
  missionCancelled: string
  missionRunning: string
  logToggle: string
  logHint: string
  missionMapAria: string
  phaseListAria: string
  captionTasksRunning: string
  captionCompleted: string
  captionGaps: (deepen: number, total: number) => string
  captionUnique: (n: number) => string
  // Network-stall warning (corporate proxy buffering the live stream)
  stallTitle: string
  stallBody: string
  // Backend log
  logAria: string
  logStatusLive: string
  logStatusDisconnected: string
  logStatusError: string
  // Results table
  resultsEyebrow: string
  resultsTitle: string
  /** Fixed research window shown above the table (backend always searches 30 days). */
  resultsRange: string
  resultsMarket: string
  exportCsv: string
  tableHint: string
  notDisclosed: string
  noResults: string
  transactionCount: (n: number) => string
  // Access gate
  gateTitle: string
  gateDescription: string
  gateLabel: string
  gateSubmit: string
  gateChecking: string
  gateWrongPassword: string
  gateLocked: string
  gateUnreachable: string
}

export const UI: Record<Lang, UIStrings> = {
  pl: {
    brandTagline: 'Real Estate · Polska',
    interfaceSection: 'Interfejs',
    avatarToggle: 'Awatar asystenta',
    avatarHint: 'Robot i jego komentarze podczas researchu.',
    langLabel: 'Język',
    sourcesSection: 'Źródła',
    opointToggle: 'Opoint (monitoring mediów)',
    opointHint: 'Wyłączony: research korzysta z Tavily i AI.',
    opointHintOn: 'Włączony: artykuły z Opoint dołączą do wyników Tavily.',
    opointUnavailable: 'Opoint jest na razie niedostępny z powodu ograniczenia tokenów.',
    opointNotConfigured: 'Opoint nie jest skonfigurowany na tym serwerze.',
    stopResearch: 'Zatrzymaj research',
    mockError: 'Symuluj błąd (Mock Error)',
    stopping: 'Przerywanie…',
    tryAgain: 'Spróbuj ponownie',
    startResearch: 'Rozpocznij research',
    headerTools: 'Narzędzia',
    headerResearch: 'Research transakcji',
    dateLocale: 'pl-PL',
    idleEyebrow: 'Dentons · Analizy rynku nieruchomości',
    idleTitlePre: 'Transakcje na polskim rynku',
    idleTitleAccent: 'nieruchomości',
    idleDescription:
      'Agent AI przeszukuje komunikaty prasowe, serwisy branżowe i rejestry, a znalezione transakcje zestawia w tabelę gotową do analizy i eksportu.',
    idleCapabilities: ['źródła z linkami', 'eksport do CSV'],
    idleHintPre: 'Aby rozpocząć, kliknij',
    idleHintButton: '„Rozpocznij research”',
    missionFailed: 'Research zakończony błędem',
    missionCancelled: 'Research przerwany',
    missionRunning: 'Research w toku',
    logToggle: 'Szczegóły',
    logHint: 'Konsola logów na żywo pod osią postępu.',
    missionMapAria: 'Oś postępu researchu',
    phaseListAria: 'Fazy researchu',
    captionTasksRunning: 'zadania w toku...',
    captionCompleted: 'ukończone',
    captionGaps: (deepen, total) => `${deepen} z ${total} z brakami`,
    captionUnique: (n) => `${n} unikalnych transakcji`,
    stallTitle: 'Twoja sieć blokuje połączenie na żywo',
    stallBody:
      'Research wystartował, ale odpowiedź na żywo nie dociera — najczęściej blokuje ją firmowe proxy lub VPN, które buforuje długie połączenia. Spróbuj z innej sieci (np. hotspot z telefonu) albo z wyłączonym VPN.',
    logAria: 'Log backendu',
    logStatusLive: 'Live status · backend',
    logStatusDisconnected: 'Rozłączono',
    logStatusError: 'Błąd backendu',
    resultsEyebrow: 'Wyniki researchu',
    resultsTitle: 'Transakcje',
    resultsRange: 'Ostatnie 30 dni',
    resultsMarket: 'rynek nieruchomości, Polska',
    exportCsv: 'Eksportuj do CSV',
    tableHint: 'Kliknij nagłówek kolumny, aby sortować · przewiń tabelę w poziomie, aby zobaczyć wszystkie kolumny',
    notDisclosed: 'nie ujawniono',
    noResults: 'W wybranym okresie nie znaleziono transakcji potwierdzonych w źródłach.',
    transactionCount: (n) => {
      if (n === 1) return '1 transakcja'
      const lastTwo = n % 100
      const last = n % 10
      if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} transakcje`
      return `${n} transakcji`
    },
    gateTitle: 'Dostęp do narzędzia',
    gateDescription: 'Podaj hasło dostępu zespołu. Zapamiętamy je w tej przeglądarce.',
    gateLabel: 'Hasło dostępu',
    gateSubmit: 'Wejdź',
    gateChecking: 'Sprawdzam…',
    gateWrongPassword: 'Nieprawidłowe hasło. Spróbuj ponownie.',
    gateLocked: 'Zbyt wiele nieudanych prób. Spróbuj ponownie za kilkanaście minut.',
    gateUnreachable: 'Nie można połączyć się z backendem. Sprawdź połączenie i spróbuj ponownie.',
  },
  en: {
    brandTagline: 'Real Estate · Poland',
    interfaceSection: 'Interface',
    avatarToggle: 'Assistant avatar',
    avatarHint: 'The robot and its commentary during research.',
    langLabel: 'Language',
    sourcesSection: 'Sources',
    opointToggle: 'Opoint (media monitoring)',
    opointHint: 'Off: the research runs on Tavily and AI.',
    opointHintOn: 'On: Opoint articles are added to the Tavily results.',
    opointUnavailable: 'Opoint is currently unavailable due to a token limit.',
    opointNotConfigured: 'Opoint is not configured on this server.',
    stopResearch: 'Stop research',
    mockError: 'Simulate error (Mock Error)',
    stopping: 'Stopping…',
    tryAgain: 'Try again',
    startResearch: 'Start research',
    headerTools: 'Tools',
    headerResearch: 'Transaction research',
    dateLocale: 'en-GB',
    idleEyebrow: 'Dentons · Real estate market analysis',
    idleTitlePre: 'Transactions on the Polish',
    idleTitleAccent: 'real estate market',
    idleDescription:
      'An AI agent scans press releases, industry portals and registers, then compiles the transactions it finds into a table ready for analysis and export.',
    idleCapabilities: ['linked sources', 'CSV export'],
    idleHintPre: 'To begin, click',
    idleHintButton: '“Start research”',
    missionFailed: 'Research ended with an error',
    missionCancelled: 'Research interrupted',
    missionRunning: 'Research in progress',
    logToggle: 'Details',
    logHint: 'Live log console below the progress timeline.',
    missionMapAria: 'Research progress timeline',
    phaseListAria: 'Research phases',
    captionTasksRunning: 'tasks in progress...',
    captionCompleted: 'completed',
    captionGaps: (deepen, total) => `${deepen} of ${total} with gaps`,
    captionUnique: (n) => `${n} unique transactions`,
    stallTitle: 'Your network is blocking the live connection',
    stallBody:
      'The research has started, but the live response is not coming through — this is usually a corporate proxy or VPN buffering long-lived connections. Try a different network (e.g. a phone hotspot) or with the VPN turned off.',
    logAria: 'Backend log',
    logStatusLive: 'Live status · backend',
    logStatusDisconnected: 'Disconnected',
    logStatusError: 'Backend error',
    resultsEyebrow: 'Research results',
    resultsTitle: 'Transactions',
    resultsRange: 'Last 30 days',
    resultsMarket: 'real estate market, Poland',
    exportCsv: 'Export to CSV',
    tableHint: 'Click a column header to sort · scroll the table horizontally to see all columns',
    notDisclosed: 'not disclosed',
    noResults: 'No transactions confirmed by sources were found in the selected period.',
    transactionCount: (n) => (n === 1 ? '1 transaction' : `${n} transactions`),
    gateTitle: 'Access to the tool',
    gateDescription: 'Enter the team access password. It will be remembered in this browser.',
    gateLabel: 'Access password',
    gateSubmit: 'Enter',
    gateChecking: 'Checking…',
    gateWrongPassword: 'Incorrect password. Please try again.',
    gateLocked: 'Too many failed attempts. Please try again in several minutes.',
    gateUnreachable: 'Cannot connect to the backend. Check your connection and try again.',
  },
}

/** Convenience hook: current language + dictionary + switchers. */
export function useI18n() {
  const { lang, toggle, setLang } = useContext(LangContext)
  return { lang, toggle, setLang, t: UI[lang] }
}

/* ------------------------------------------------------------------ */
/* Backend message translation (the workflow streams in Polish)        */
/* ------------------------------------------------------------------ */

/** Names of the three research tasks — appear in done_labels and event messages. */
const RESEARCH_LABELS_EN: Array<[RegExp, string]> = [
  [/sprzedaże i przejęcia/g, 'sales & acquisitions'],
  [/finansowania, refinansowania i JV/g, 'financings, refinancings & JVs'],
  [/finansowania i JV/g, 'financings & JVs'],
  [/komunikaty kancelarii prawnych/g, 'law firm announcements'],
  [/kancelarie prawne/g, 'law firms'],
]

/** Translates research task names inside any text (e.g. done_labels in phase captions). */
export function translateResearchLabels(text: string): string {
  return RESEARCH_LABELS_EN.reduce((acc, [re, en]) => acc.replace(re, en), text)
}

/** Phase tag from a backend event (the `phase` field) + tags generated by the frontend. */
const PHASE_TAGS_EN: Record<string, string> = {
  Inicjalizacja: 'Initialization',
  'Start researchu': 'Research launch',
  'Deep research': 'Deep research',
  'Scalanie wyników': 'Merging results',
  'Analiza braków': 'Gap analysis',
  Pogłębianie: 'Deepening',
  Kompilacja: 'Compilation',
  Zakończono: 'Finished',
  Przerwano: 'Aborted',
  BŁĄD: 'ERROR',
}

export function translatePhaseTag(tag: string, lang: Lang): string {
  if (lang === 'pl') return tag
  return PHASE_TAGS_EN[tag] ?? tag
}

/**
 * Message templates 1:1 with the backend (apps/backend/src/pipeline/messages.ts)
 * and with the lines generated by the frontend (App/researchStream). A line that
 * matches no pattern (e.g. a technical HTTP detail) stays unchanged.
 */
const LINE_RULES: Array<[RegExp, string]> = [
  // --- backend events ---
  [
    /^Pobieram artykuły z Opoint \(monitoring mediów\) — okno: (.+) – (.+)\.\.\.$/,
    'Fetching articles from Opoint (media monitoring) — window: $1 – $2...',
  ],
  [/^Opoint — liczba artykułów pobranych z monitoringu mediów: (\d+)\.$/, 'Opoint — articles fetched from media monitoring: $1.'],
  [/^Opoint: (.+)\.$/, 'Opoint: $1.'],
  [
    /^Opoint niedostępny \((.+)\) — kontynuuję wyłącznie na podstawie Tavily\.$/,
    'Opoint unavailable ($1) — continuing on Tavily alone.',
  ],
  [/^Opoint wyłączony — research wyłącznie na podstawie Tavily\.$/, 'Opoint switched off — research on Tavily alone.'],
  [
    /^Po pogłębieniu usunięto (\d+) wpisów \(duplikaty, bez daty lub starsze niż limit\) — w tabeli zostaje (\d+) transakcji\.$/,
    'After deepening, $1 entries were removed (duplicates, undated or older than the limit) — $2 transactions remain in the table.',
  ],
  [
    /^Opoint jest na razie niedostępny z powodu ograniczenia tokenów — uruchom research bez Opointa\.$/,
    'Opoint is currently unavailable due to a token limit — run the research without Opoint.',
  ],
  [
    /^Opoint nie jest skonfigurowany na tym serwerze — uruchom research bez Opointa\.$/,
    'Opoint is not configured on this server — run the research without Opoint.',
  ],
  [
    /^Wyszukiwanie zakończone: (\d+) zapytań, (\d+) stron — do analizy wybrano (\d+) artykułów\.$/,
    'Search finished: $1 queries, $2 pages — $3 articles selected for analysis.',
  ],
  [
    /^Deep research w toku — ukończono (\d+) z (\d+) zadań badawczych( \([^)]*\))?\. Analizuję kolejne źródła\.\.\.$/,
    'Deep research in progress — $1 of $2 research tasks completed$3. Analysing further sources...',
  ],
  [
    /^Analiza artykułów: (\d+) z (\d+) przeanalizowanych, wstępnie (\d+) transakcji\.\.\.$/,
    'Article analysis: $1 of $2 analysed, $3 transactions so far...',
  ],
  [
    /^Weryfikacja cytatów — pola odrzucone z braku potwierdzenia w źródle: (\d+); transakcje odrzucone \(najem, raport rynkowy, poza Polską lub poza oknem czasowym\): (\d+)\.$/,
    'Quote verification — fields rejected for lack of confirmation in the source: $1; transactions rejected (lease, market report, outside Poland or outside the time window): $2.',
  ],
  [
    /^Wszystkie transakcje mają komplet danych — pomijam pogłębianie\.$/,
    'All transactions have complete data — skipping the deepening phase.',
  ],
  [
    /^Brak nowych wiarygodnych źródeł dla: (.+) — pozostawiam pola puste\.$/,
    'No new reliable sources for: $1 — leaving the fields empty.',
  ],
  [/^Uzupełniono pola potwierdzone cytatem \((\d+)\) dla: (.+)\.$/, 'Filled fields confirmed by a quote ($1) for: $2.'],
  [
    /^Nowe źródła nie potwierdziły brakujących pól dla: (.+) — pozostawiam je puste\.$/,
    'The new sources did not confirm the missing fields for: $1 — leaving them empty.',
  ],
  [
    /^Pominięto (\d+) artykułów, których analiza nie powiodła się \((.+)\)\.$/,
    'Skipped $1 articles whose analysis failed ($2).',
  ],
  [/^Tavily: (\d+) z (\d+) zapytań nie powiodło się \((.+)\)\.$/, 'Tavily: $1 of $2 queries failed ($3).'],
  [/^Research zakończył się błędem\.$/, 'The research ended with an error.'],
  [/^Research przerwany\.$/, 'Research interrupted.'],
  [
    /^Research przekroczył limit czasu \((\d+) min\) i został przerwany\.$/,
    'The research exceeded the time limit ($1 min) and was stopped.',
  ],
  [
    /^Trwa już maksymalna liczba równoległych researchy — spróbuj ponownie za kilka minut\.$/,
    'The maximum number of parallel research runs is already in progress — try again in a few minutes.',
  ],
  [/^Wyczerpano dzienny limit researchy — spróbuj ponownie jutro\.$/, 'The daily research limit has been reached — try again tomorrow.'],
  [/^Rate limit exceeded, retry in (.+)$/, 'Rate limit exceeded, retry in $1'],
  [
    /^Połączono z backendem — rozpoczynam deep research rynku nieruchomości w Polsce \(okno: ostatnie (\d+) dni\)\.\.\.$/,
    'Connected to the backend — starting deep research of the Polish real estate market (window: last $1 days)...',
  ],
  [
    /^Uruchamiam 3 równoległe zadania deep research: .+\.\.\.$/,
    'Launching 3 parallel deep research tasks: sales & acquisitions · financings, refinancings & JVs · law firm announcements...',
  ],
  [
    /^Deep research w toku — ukończono (\d+) z (\d+) zadań badawczych( \([^)]*\))?\. Kolejne sprawdzenie za 30 sekund\.\.\.$/,
    'Deep research in progress — $1 of $2 research tasks completed$3. Next check in 30 seconds...',
  ],
  [
    /^Research zakończony — po scaleniu duplikatów mam (\d+) unikalnych transakcji\. Sprawdzam kompletność danych\.\.\.$/,
    'Research complete — after merging duplicates I have $1 unique transactions. Checking data completeness...',
  ],
  [
    /^(\d+) z (\d+) transakcji ma braki w danych \(doradcy prawni, wartość, daty\) — pogłębiam je jedna po drugiej\.\.\.$/,
    '$1 of $2 transactions have data gaps (legal advisors, value, dates) — deepening them one by one...',
  ],
  [
    /^Pogłębiam transakcję (\d+) z (\d+): (.+) — planuję zapytania uzupełniające\.\.\.$/,
    'Deepening transaction $1 of $2: $3 — planning follow-up queries...',
  ],
  [/^Pobieram treść (\d+) nowych źródeł dla: (.+)\.\.\.$/, 'Fetching the content of $1 new sources for: $2...'],
  [
    /^Analizuję pobrane artykuły \(LLM uzupełnia tylko brakujące pola\): (.+)\.\.\.$/,
    'Analysing the fetched articles (the LLM fills in only the missing fields): $1...',
  ],
  [
    /^Kompiluję ostateczną tabelę transakcji i źródła informacji\.\.\.$/,
    'Compiling the final transaction table and information sources...',
  ],
  [
    /^Gotowe — (\d+) transakcji w finalnej tabeli\. Przesyłam wyniki\.\.\.$/,
    'Done — $1 transactions in the final table. Sending the results...',
  ],
  [
    /^Otrzymałem żądanie zatrzymania — przerywam research i kończę egzekucję\.$/,
    'Received a stop request — aborting the research and ending the execution.',
  ],
  // --- frontend-generated lines ---
  [/^Łączenie z backendem \((.+)\)\.\.\.$/, 'Connecting to the backend ($1)...'],
  [
    /^Research uruchomiony \(zadanie (.+)\) — otwieram strumień na żywo\.\.\.$/,
    'Research started (job $1) — opening the live stream...',
  ],
  [
    /^Strumień na żywo niedostępny — przełączam na tryb odpytywania\.\.\.$/,
    'Live stream unavailable — switching to polling mode...',
  ],
  [/^Nie udało się połączyć z backendem \((.+)\)$/, 'Could not connect to the backend ($1)'],
  [/^Backend nie zwrócił identyfikatora researchu$/, 'The backend did not return a research id'],
  [/^Backend nie zna już tego researchu \(restart usługi\?\)$/, 'The backend no longer knows this research run (service restart?)'],
  [/^Utracono połączenie z backendem \((\d+) nieudanych prób\): (.+)$/, 'Lost the connection to the backend ($1 failed attempts): $2'],
  [/^Backend zgłosił błąd$/, 'The backend reported an error'],
  [/^Otrzymano (\d+) rekordów — zamykam połączenie\.$/, 'Received $1 records — closing the connection.'],
  [/^Połączenie przerwane przez użytkownika\.$/, 'Connection interrupted by the user.'],
  [
    /^Symulacja błędu backendu \(Mock Error\) — połączenie SSE przerwane ręcznie\.$/,
    'Simulated backend error (Mock Error) — SSE connection interrupted manually.',
  ],
  [/^Strumień zakończył się bez finalnych danych$/, 'The stream ended without the final data'],
  [/^ostatni odebrany fragment: (.*)$/, 'last received chunk: $1'],
]

function translateLine(line: string): string {
  for (const [re, replacement] of LINE_RULES) {
    if (re.test(line)) return translateResearchLabels(line.replace(re, replacement))
  }
  return line
}

/**
 * Translates a backend/frontend message to English at render time.
 * Multiline messages (error details) are translated line by line;
 * unrecognised lines (URLs, HTTP statuses, JSON) are left untouched.
 */
export function translateBackendText(text: string, lang: Lang): string {
  if (lang === 'pl') return text
  return text.split('\n').map(translateLine).join('\n')
}
