import type { BackendPhaseId, ProgressEvent, ResearchWindow } from '@re/shared'
import { toPlDate } from '../deals/dates'
import { LANE_LABELS, LANE_ORDER, type LaneId } from '../types'

/**
 * Every line the backend writes to the mission log. Messages are Polish; the
 * frontend translates them at render time with regex rules
 * (apps/frontend/src/lib/i18n.tsx, LINE_RULES) — change the wording in both places.
 */

const researchPhase = (completed: number): BackendPhaseId => (['research_1', 'research_2', 'research_3'] as const)[Math.min(Math.max(completed, 0), 2)]

/** Lane names in timeline order, as the frontend expects them in done_labels. */
export function doneLabels(done: Set<LaneId>): string {
  return LANE_ORDER.filter((lane) => done.has(lane))
    .map((lane) => LANE_LABELS[lane])
    .join(', ')
}

export const msg = {
  init: (window: ResearchWindow): ProgressEvent => ({
    phase_id: 'init',
    phase: 'Inicjalizacja',
    message: `Połączono z backendem — rozpoczynam deep research rynku nieruchomości w Polsce (okno: ostatnie ${window.days} dni)...`,
  }),

  opointFetch: (window: ResearchWindow): ProgressEvent => ({
    phase_id: 'research_launch',
    phase: 'Start researchu',
    message: `Pobieram artykuły z Opoint (monitoring mediów) — okno: ${toPlDate(window.from)} – ${toPlDate(window.to)}...`,
  }),

  opointResult: (fetched: number): ProgressEvent => ({
    phase_id: 'research_launch',
    phase: 'Start researchu',
    message: `Opoint — liczba artykułów pobranych z monitoringu mediów: ${fetched}.`,
  }),

  opointUnavailable: (reason: string): ProgressEvent => ({
    phase_id: 'research_launch',
    phase: 'Start researchu',
    message: `Opoint niedostępny (${reason}) — kontynuuję wyłącznie na podstawie Tavily.`,
  }),

  /** Opoint not plugged into this run: the user's switch is off, OPOINT_ENABLED=false or no token. */
  opointOff: (): ProgressEvent => ({
    phase_id: 'research_launch',
    phase: 'Start researchu',
    message: 'Opoint wyłączony — research wyłącznie na podstawie Tavily.',
  }),

  duplicatesMerged: (merged: number, remaining: number): ProgressEvent => ({
    phase_id: 'compile',
    phase: 'Scalanie wyników',
    message: `Po pogłębieniu usunięto ${merged} wpisów (duplikaty, bez daty lub starsze niż limit) — w tabeli zostaje ${remaining} transakcji.`,
  }),

  opointWarning: (detail: string): ProgressEvent => ({
    phase: 'Start researchu',
    message: `Opoint: ${detail}.`,
  }),

  lanesStart: (): ProgressEvent => ({
    phase_id: 'research_launch',
    phase: 'Start researchu',
    message:
      'Uruchamiam 3 równoległe zadania deep research: sprzedaże i przejęcia · finansowania, refinansowania i JV · komunikaty kancelarii prawnych...',
    total: 3,
  }),

  searchDone: (queries: number, pages: number, kept: number): ProgressEvent => ({
    phase_id: 'research_1',
    phase: 'Deep research',
    message: `Wyszukiwanie zakończone: ${queries} zapytań, ${pages} stron — do analizy wybrano ${kept} artykułów.`,
    completed: 0,
    total: 3,
    done_labels: '',
  }),

  laneProgress: (done: Set<LaneId>): ProgressEvent => {
    const labels = doneLabels(done)
    return {
      phase_id: researchPhase(done.size),
      phase: 'Deep research',
      message: `Deep research w toku — ukończono ${done.size} z 3 zadań badawczych${labels ? ` (${labels})` : ''}. Analizuję kolejne źródła...`,
      completed: done.size,
      total: 3,
      done_labels: labels,
    }
  },

  extractionProgress: (analysed: number, total: number, deals: number, done: Set<LaneId>): ProgressEvent => ({
    phase_id: researchPhase(done.size),
    phase: 'Deep research',
    message: `Analiza artykułów: ${analysed} z ${total} przeanalizowanych, wstępnie ${deals} transakcji...`,
    completed: done.size,
    total: 3,
    done_labels: doneLabels(done),
  }),

  merged: (deals: number): ProgressEvent => ({
    phase_id: 'dedup',
    phase: 'Scalanie wyników',
    message: `Research zakończony — po scaleniu duplikatów mam ${deals} unikalnych transakcji. Sprawdzam kompletność danych...`,
    deals_total: deals,
  }),

  verification: (fields: number, deals: number, total: number): ProgressEvent => ({
    phase_id: 'dedup',
    phase: 'Scalanie wyników',
    message: `Weryfikacja cytatów — pola odrzucone z braku potwierdzenia w źródle: ${fields}; transakcje odrzucone (najem, raport rynkowy, poza Polską lub poza oknem czasowym): ${deals}.`,
    deals_total: total,
  }),

  gaps: (deepen: number, total: number): ProgressEvent => ({
    phase_id: 'gap_analysis',
    phase: 'Analiza braków',
    message: `${deepen} z ${total} transakcji ma braki w danych (doradcy prawni, wartość, daty) — pogłębiam je jedna po drugiej...`,
    deepen_total: deepen,
    deals_total: total,
  }),

  noGaps: (total: number): ProgressEvent => ({
    phase_id: 'deepening',
    phase: 'Pogłębianie',
    message: 'Wszystkie transakcje mają komplet danych — pomijam pogłębianie.',
    progress: 1,
    deals_total: total,
  }),

  dealStart: (deal: string, index: number, total: number, progress: number): ProgressEvent => ({
    phase_id: 'deepening',
    phase: 'Pogłębianie',
    message: `Pogłębiam transakcję ${index} z ${total}: ${deal} — planuję zapytania uzupełniające...`,
    progress,
    deal,
    deal_index: index,
    deal_total: total,
  }),

  dealSources: (deal: string, index: number, total: number, sources: number, progress: number): ProgressEvent => ({
    phase_id: 'deepening',
    phase: 'Pogłębianie',
    message: `Pobieram treść ${sources} nowych źródeł dla: ${deal}...`,
    progress,
    deal,
    deal_index: index,
    deal_total: total,
    sources,
  }),

  dealNoSources: (deal: string, index: number, total: number, progress: number): ProgressEvent => ({
    phase_id: 'deepening',
    phase: 'Pogłębianie',
    message: `Brak nowych wiarygodnych źródeł dla: ${deal} — pozostawiam pola puste.`,
    progress,
    deal,
    deal_index: index,
    deal_total: total,
  }),

  dealEnrich: (deal: string, index: number, total: number, progress: number): ProgressEvent => ({
    phase_id: 'deepening',
    phase: 'Pogłębianie',
    message: `Analizuję pobrane artykuły (LLM uzupełnia tylko brakujące pola): ${deal}...`,
    progress,
    deal,
    deal_index: index,
    deal_total: total,
  }),

  dealResult: (deal: string, index: number, total: number, filled: number, progress: number): ProgressEvent => ({
    phase_id: 'deepening',
    phase: 'Pogłębianie',
    message:
      filled > 0
        ? `Uzupełniono pola potwierdzone cytatem (${filled}) dla: ${deal}.`
        : `Nowe źródła nie potwierdziły brakujących pól dla: ${deal} — pozostawiam je puste.`,
    progress,
    deal,
    deal_index: index,
    deal_total: total,
  }),

  compile: (): ProgressEvent => ({
    phase_id: 'compile',
    phase: 'Kompilacja',
    message: 'Kompiluję ostateczną tabelę transakcji i źródła informacji...',
  }),

  done: (deals: number): ProgressEvent => ({
    phase_id: 'done',
    phase: 'Zakończono',
    message: `Gotowe — ${deals} transakcji w finalnej tabeli. Przesyłam wyniki...`,
  }),

  aborted: (): ProgressEvent => ({
    phase: 'Przerwano',
    message: 'Otrzymałem żądanie zatrzymania — przerywam research i kończę egzekucję.',
  }),

  warning: (phase: string, message: string): ProgressEvent => ({ phase, message }),
}
