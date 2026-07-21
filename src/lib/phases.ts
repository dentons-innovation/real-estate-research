import type { ResearchEventMeta } from './researchStream'

/**
 * Definicje 11 faz Mapy Misji (strona frontendu).
 *
 * Backend (workflow "Poland RE Deals - Live Research SSE") emituje 10 phase_id;
 * frontend mapuje je na własne checkpointy:
 *  - `dedup` + `gap_analysis` → jeden checkpoint `dedup_gaps` (obie fazy są krótkie),
 *  - `deepening` (z progress 0..1) → trzy checkpointy `deepening_1..3`
 *    (faza jest długa — dzielimy ją wizualnie na etapy po 1/3 postępu).
 * Mapowanie robi resolvePhase() — jedyne miejsce tej logiki.
 */

export type PhaseId =
  | 'init'
  | 'research_launch'
  | 'research_1'
  | 'research_2'
  | 'research_3'
  | 'dedup_gaps'
  | 'deepening_1'
  | 'deepening_2'
  | 'deepening_3'
  | 'compile'
  | 'done'

/** Nazwa glifu — JSX ikon mieszka w PhaseList.tsx (PHASE_ICONS). */
export type PhaseIcon = 'plug' | 'launch' | 'radar' | 'merge' | 'drill' | 'table' | 'check'

export interface PhaseDef {
  id: PhaseId
  /** Numer 1..11 pokazywany przy checkpoincie. */
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
  { id: 'dedup_gaps', num: 6, label: 'Scalanie i braki', listLabel: 'Scalanie wyników i analiza braków', icon: 'merge' },
  { id: 'deepening_1', num: 7, label: 'Pogłębianie 1/3', listLabel: 'Pogłębianie transakcji — etap 1/3', icon: 'drill' },
  { id: 'deepening_2', num: 8, label: 'Pogłębianie 2/3', listLabel: 'Pogłębianie transakcji — etap 2/3', icon: 'drill' },
  { id: 'deepening_3', num: 9, label: 'Pogłębianie 3/3', listLabel: 'Pogłębianie transakcji — etap 3/3', icon: 'drill' },
  { id: 'compile', num: 10, label: 'Kompilacja', listLabel: 'Budowa tabeli wynikowej', icon: 'table' },
  { id: 'done', num: 11, label: 'Gotowe', listLabel: 'Wyniki gotowe', icon: 'check' },
]

const BASE_INDEX = Object.fromEntries(PHASES.map((p, i) => [p.id, i]))

/**
 * phase_id → indeks w PHASES; zawiera też aliasy backendowych id
 * (dedup / gap_analysis → wspólny checkpoint). Nieznane id → undefined.
 */
export const PHASE_INDEX: Record<string, number> = {
  ...BASE_INDEX,
  dedup: BASE_INDEX.dedup_gaps,
  gap_analysis: BASE_INDEX.dedup_gaps,
}

export const LAST_PHASE = PHASES.length - 1

/**
 * Mapuje surowe phase_id + progress z backendu na checkpoint frontendu
 * i lokalny postęp 0..1 wewnątrz niego. Backendowe `deepening` dzielimy
 * na trzy wizualne etapy po 1/3 łącznego postępu pętli per-deal.
 */
export function resolvePhase(phaseId: string, progress: number): { idx: number; progress: number } | null {
  const p = Math.min(1, Math.max(0, progress))
  if (phaseId === 'deepening') {
    const scaled = Math.min(p * 3, 2.999)
    const sub = Math.floor(scaled)
    return { idx: BASE_INDEX.deepening_1 + sub, progress: scaled - sub }
  }
  const idx = PHASE_INDEX[phaseId]
  return idx === undefined ? null : { idx, progress: p }
}

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
  if (id === 'dedup_gaps' || id.startsWith('deepening')) return 'teal'
  if (id === 'compile' || id === 'done') return 'light'
  return 'gold'
}
