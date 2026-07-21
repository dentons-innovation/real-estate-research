/**
 * Definicje 10 atomowych faz misji — wspólny kontrakt z backendem n8n.
 * Kolejność tablicy PHASES = kolejność checkpointów na timeline i musi
 * odpowiadać grupom sticky notes w "Poland RE Deals - Live Research SSE.json".
 *
 * Fazy research_1..3 odpowiadają kolejnym UKOŃCZONYM zadaniom deep research
 * (taski biegną równolegle, więc robot awansuje po liczniku ukończonych,
 * a nazwy konkretnych researchy niesie meta.doneLabels i log).
 */

import type { ResearchEventMeta } from './researchStream'

export type PhaseId =
  | 'init'
  | 'research_launch'
  | 'research_1'
  | 'research_2'
  | 'research_3'
  | 'dedup'
  | 'gap_analysis'
  | 'deepening'
  | 'compile'
  | 'done'

/** Nazwa glifu — JSX ikon mieszka w PhaseList.tsx (PHASE_ICONS). */
export type PhaseIcon = 'plug' | 'launch' | 'radar' | 'merge' | 'gaps' | 'drill' | 'table' | 'check'

export interface PhaseDef {
  id: PhaseId
  /** Numer 1..10 pokazywany przy checkpoincie. */
  num: number
  /** Krótka etykieta pod checkpointem na timeline. */
  label: string
  /** Pełna etykieta — lista faz i nagłówki sekcji w konsoli logów. */
  listLabel: string
  icon: PhaseIcon
}

export const PHASES: PhaseDef[] = [
  { id: 'init', num: 1, label: 'Start', listLabel: 'Połączenie z backendem', icon: 'plug' },
  { id: 'research_launch', num: 2, label: 'Zadania', listLabel: 'Uruchomienie 3 zadań deep research', icon: 'launch' },
  { id: 'research_1', num: 3, label: 'Research 1/3', listLabel: 'Research: sprzedaże i przejęcia', icon: 'radar' },
  { id: 'research_2', num: 4, label: 'Research 2/3', listLabel: 'Research: finansowania i JV', icon: 'radar' },
  { id: 'research_3', num: 5, label: 'Research 3/3', listLabel: 'Research: kancelarie prawne', icon: 'radar' },
  { id: 'dedup', num: 6, label: 'Scalanie', listLabel: 'Scalanie i deduplikacja wyników', icon: 'merge' },
  { id: 'gap_analysis', num: 7, label: 'Braki', listLabel: 'Analiza kompletności danych', icon: 'gaps' },
  { id: 'deepening', num: 8, label: 'Pogłębianie', listLabel: 'Pogłębianie transakcji z brakami', icon: 'drill' },
  { id: 'compile', num: 9, label: 'Kompilacja', listLabel: 'Budowa tabeli wynikowej', icon: 'table' },
  { id: 'done', num: 10, label: 'Gotowe', listLabel: 'Wyniki gotowe', icon: 'check' },
]

/** phase_id → indeks w PHASES; nieznane id → undefined (timeline bez ruchu). */
export const PHASE_INDEX: Record<string, number> = Object.fromEntries(PHASES.map((p, i) => [p.id, i]))

export const LAST_PHASE = PHASES.length - 1

/** Stan misji trzymany w App i sterujący timeline'em + listą faz. */
export interface MissionState {
  /** Indeks aktywnej fazy w PHASES (0..LAST_PHASE). */
  idx: number
  /** Postęp 0..1 wewnątrz aktywnej fazy. */
  progress: number
  /** Scalone meta z ostatnich eventów (liczniki, nazwa deala itd.). */
  meta?: ResearchEventMeta
}

/** Grupa kolorystyczna fazy — tagi w logu i akcenty listy. */
export function phaseGroupColor(id: PhaseId): 'gold' | 'teal' | 'light' {
  if (id === 'gap_analysis' || id === 'deepening') return 'teal'
  if (id === 'compile' || id === 'done') return 'light'
  return 'gold'
}
