import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Dwujęzyczność aplikacji (PL/EN) bez zmian w backendzie.
 *
 * Backend n8n zawsze streamuje komunikaty po polsku — workflow jest nietykalny.
 * Angielskie wersje komunikatów odtwarzamy na froncie przy RENDEROWANIU
 * (translateBackendText dopasowuje znane szablony workflow), dzięki czemu
 * przełącznik języka tłumaczy także wpisy, które już siedzą w konsoli.
 */

export type Lang = 'pl' | 'en'

/** Tekst w obu językach — etykiety faz, kolumn tabeli itd. */
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
  searchParams: string
  timeRange: string
  interfaceSection: string
  avatarToggle: string
  avatarHint: string
  langLabel: string
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
  hideDetails: string
  showDetails: string
  missionMapAria: string
  phaseListAria: string
  captionTasksRunning: string
  captionCompleted: string
  captionGaps: (deepen: number, total: number) => string
  captionUnique: (n: number) => string
  // Backend log
  logAria: string
  logStatusLive: string
  logStatusDisconnected: string
  logStatusError: string
  // Results table
  resultsEyebrow: string
  resultsTitle: string
  resultsMarket: string
  exportCsv: string
  tableHint: string
  notDisclosed: string
  transactionCount: (n: number) => string
}

export const UI: Record<Lang, UIStrings> = {
  pl: {
    brandTagline: 'Real Estate · Polska',
    searchParams: 'Parametry wyszukiwania',
    timeRange: 'Zakres czasu',
    interfaceSection: 'Interfejs',
    avatarToggle: 'Awatar asystenta',
    avatarHint: 'Robot i jego komentarze podczas researchu.',
    langLabel: 'Język',
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
    idleCapabilities: ['14 kolumn danych', 'źródła z linkami', 'eksport do CSV'],
    idleHintPre: 'Ustaw zakres czasu i kliknij',
    idleHintButton: '„Rozpocznij research”',
    missionFailed: 'Research zakończony błędem',
    missionCancelled: 'Research przerwany',
    missionRunning: 'Research w toku — mapa misji',
    hideDetails: 'Ukryj szczegóły',
    showDetails: 'Pokaż szczegóły',
    missionMapAria: 'Mapa misji researchu',
    phaseListAria: 'Fazy misji',
    captionTasksRunning: 'zadania w toku...',
    captionCompleted: 'ukończone',
    captionGaps: (deepen, total) => `${deepen} z ${total} z brakami`,
    captionUnique: (n) => `${n} unikalnych transakcji`,
    logAria: 'Log backendu',
    logStatusLive: 'Live status · backend',
    logStatusDisconnected: 'Rozłączono',
    logStatusError: 'Błąd backendu',
    resultsEyebrow: 'Wyniki researchu',
    resultsTitle: 'Transakcje',
    resultsMarket: 'rynek nieruchomości, Polska',
    exportCsv: 'Eksportuj do CSV',
    tableHint: 'Kliknij nagłówek kolumny, aby sortować · przewiń tabelę w poziomie, aby zobaczyć wszystkie kolumny',
    notDisclosed: 'nie ujawniono',
    transactionCount: (n) => {
      if (n === 1) return '1 transakcja'
      const lastTwo = n % 100
      const last = n % 10
      if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} transakcje`
      return `${n} transakcji`
    },
  },
  en: {
    brandTagline: 'Real Estate · Poland',
    searchParams: 'Search parameters',
    timeRange: 'Time range',
    interfaceSection: 'Interface',
    avatarToggle: 'Assistant avatar',
    avatarHint: 'The robot and its commentary during research.',
    langLabel: 'Language',
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
    idleCapabilities: ['14 data columns', 'linked sources', 'CSV export'],
    idleHintPre: 'Set the time range and click',
    idleHintButton: '“Start research”',
    missionFailed: 'Research ended with an error',
    missionCancelled: 'Research interrupted',
    missionRunning: 'Research in progress — mission map',
    hideDetails: 'Hide details',
    showDetails: 'Show details',
    missionMapAria: 'Research mission map',
    phaseListAria: 'Mission phases',
    captionTasksRunning: 'tasks in progress...',
    captionCompleted: 'completed',
    captionGaps: (deepen, total) => `${deepen} of ${total} with gaps`,
    captionUnique: (n) => `${n} unique transactions`,
    logAria: 'Backend log',
    logStatusLive: 'Live status · backend',
    logStatusDisconnected: 'Disconnected',
    logStatusError: 'Backend error',
    resultsEyebrow: 'Research results',
    resultsTitle: 'Transactions',
    resultsMarket: 'real estate market, Poland',
    exportCsv: 'Export to CSV',
    tableHint: 'Click a column header to sort · scroll the table horizontally to see all columns',
    notDisclosed: 'not disclosed',
    transactionCount: (n) => (n === 1 ? '1 transaction' : `${n} transactions`),
  },
}

/** Hook-wygodnik: bieżący język + słownik + przełączniki. */
export function useI18n() {
  const { lang, toggle, setLang } = useContext(LangContext)
  return { lang, toggle, setLang, t: UI[lang] }
}

/* ------------------------------------------------------------------ */
/* Tłumaczenie komunikatów backendu (workflow streamuje po polsku)     */
/* ------------------------------------------------------------------ */

/** Nazwy trzech zadań researchu — pojawiają się w done_labels i treściach eventów. */
const RESEARCH_LABELS_EN: Array<[RegExp, string]> = [
  [/sprzedaże i przejęcia/g, 'sales & acquisitions'],
  [/finansowania, refinansowania i JV/g, 'financings, refinancings & JVs'],
  [/finansowania i JV/g, 'financings & JVs'],
  [/komunikaty kancelarii prawnych/g, 'law firm announcements'],
  [/kancelarie prawne/g, 'law firms'],
]

/** Tłumaczy nazwy researchy wewnątrz dowolnego tekstu (np. done_labels w podpisach faz). */
export function translateResearchLabels(text: string): string {
  return RESEARCH_LABELS_EN.reduce((acc, [re, en]) => acc.replace(re, en), text)
}

/** Tag fazy z eventu backendu (pole `phase`) + tagi generowane przez frontend. */
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
 * Szablony komunikatów 1:1 z workflow "Poland RE Deals - Live Research SSE"
 * oraz z linii generowanych przez frontend (App/researchStream). Linia, która
 * nie pasuje do żadnego wzorca (np. techniczny szczegół HTTP), zostaje bez zmian.
 */
const LINE_RULES: Array<[RegExp, string]> = [
  // --- eventy workflow ---
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
  // --- linie generowane przez frontend ---
  [/^Łączenie z backendem \((.+)\)\.\.\.$/, 'Connecting to the backend ($1)...'],
  [/^Otrzymano (\d+) rekordów — zamykam połączenie\.$/, 'Received $1 records — closing the connection.'],
  [/^Połączenie przerwane przez użytkownika\.$/, 'Connection interrupted by the user.'],
  [
    /^Symulacja błędu backendu \(Mock Error\) — połączenie SSE przerwane ręcznie\.$/,
    'Simulated backend error (Mock Error) — SSE connection interrupted manually.',
  ],
  [/^Strumień zakończył się bez finalnych danych$/, 'The stream ended without the final data'],
  [/^ostatni odebrany fragment: (.*)$/, 'last received chunk: $1'],
  [/^Brak strumienia w odpowiedzi \(response\.body === null\)$/, 'No stream in the response (response.body === null)'],
]

function translateLine(line: string): string {
  for (const [re, replacement] of LINE_RULES) {
    if (re.test(line)) return translateResearchLabels(line.replace(re, replacement))
  }
  return line
}

/**
 * Tłumaczy komunikat backendu/frontendu na angielski przy renderowaniu.
 * Komunikaty wielolinijkowe (szczegóły błędów) tłumaczone są linia po linii;
 * nierozpoznane linie (URL-e, statusy HTTP, JSON) zostają nietknięte.
 */
export function translateBackendText(text: string, lang: Lang): string {
  if (lang === 'pl') return text
  return text.split('\n').map(translateLine).join('\n')
}
