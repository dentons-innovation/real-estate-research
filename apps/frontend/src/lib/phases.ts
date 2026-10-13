import type { ResearchEventMeta } from './researchStream'
import type { Localized } from './i18n'

/**
 * Definitions of the 11 Mission Map phases (frontend side).
 *
 * The backend (the "Poland RE Deals - Live Research SSE" workflow) emits 10
 * phase_ids; the frontend maps them onto its own checkpoints:
 *  - `dedup` + `gap_analysis` → a single `dedup_gaps` checkpoint (both are short),
 *  - `deepening` (with progress 0..1) → three checkpoints `deepening_1..3`
 *    (the phase is long — split visually into 1/3-progress stages).
 * resolvePhase() does the mapping — the only place with this logic.
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

/** Glyph name — the icon JSX lives in PhaseList.tsx (PHASE_ICONS). */
export type PhaseIcon = 'plug' | 'launch' | 'radar' | 'merge' | 'drill' | 'table' | 'check'

export interface PhaseDef {
  id: PhaseId
  /** Number 1..11 shown next to the checkpoint. */
  num: number
  /** Short label under the timeline checkpoint (PL/EN). */
  label: Localized
  /** Full label — phase list and console section headers (PL/EN). */
  listLabel: Localized
  icon: PhaseIcon
}

export const PHASES: PhaseDef[] = [
  {
    id: 'init',
    num: 1,
    label: { pl: 'Start', en: 'Start' },
    listLabel: { pl: 'Połączenie z backendem', en: 'Backend connection' },
    icon: 'plug',
  },
  {
    id: 'research_launch',
    num: 2,
    label: { pl: 'Zadania', en: 'Tasks' },
    listLabel: { pl: 'Uruchomienie 3 zadań deep research', en: 'Launching 3 deep research tasks' },
    icon: 'launch',
  },
  {
    id: 'research_1',
    num: 3,
    label: { pl: 'Research 1/3', en: 'Research 1/3' },
    listLabel: { pl: 'Research: sprzedaże i przejęcia', en: 'Research: sales & acquisitions' },
    icon: 'radar',
  },
  {
    id: 'research_2',
    num: 4,
    label: { pl: 'Research 2/3', en: 'Research 2/3' },
    listLabel: { pl: 'Research: finansowania i JV', en: 'Research: financings & JVs' },
    icon: 'radar',
  },
  {
    id: 'research_3',
    num: 5,
    label: { pl: 'Research 3/3', en: 'Research 3/3' },
    listLabel: { pl: 'Research: kancelarie prawne', en: 'Research: law firms' },
    icon: 'radar',
  },
  {
    id: 'dedup_gaps',
    num: 6,
    label: { pl: 'Scalanie i braki', en: 'Merge & gaps' },
    listLabel: { pl: 'Scalanie wyników i analiza braków', en: 'Merging results & gap analysis' },
    icon: 'merge',
  },
  {
    id: 'deepening_1',
    num: 7,
    label: { pl: 'Pogłębianie 1/3', en: 'Deepening 1/3' },
    listLabel: { pl: 'Pogłębianie transakcji — etap 1/3', en: 'Deal deepening — stage 1/3' },
    icon: 'drill',
  },
  {
    id: 'deepening_2',
    num: 8,
    label: { pl: 'Pogłębianie 2/3', en: 'Deepening 2/3' },
    listLabel: { pl: 'Pogłębianie transakcji — etap 2/3', en: 'Deal deepening — stage 2/3' },
    icon: 'drill',
  },
  {
    id: 'deepening_3',
    num: 9,
    label: { pl: 'Pogłębianie 3/3', en: 'Deepening 3/3' },
    listLabel: { pl: 'Pogłębianie transakcji — etap 3/3', en: 'Deal deepening — stage 3/3' },
    icon: 'drill',
  },
  {
    id: 'compile',
    num: 10,
    label: { pl: 'Kompilacja', en: 'Compile' },
    listLabel: { pl: 'Budowa tabeli wynikowej', en: 'Building the results table' },
    icon: 'table',
  },
  {
    id: 'done',
    num: 11,
    label: { pl: 'Gotowe', en: 'Done' },
    listLabel: { pl: 'Wyniki gotowe', en: 'Results ready' },
    icon: 'check',
  },
]

const BASE_INDEX = Object.fromEntries(PHASES.map((p, i) => [p.id, i]))

/**
 * phase_id → index in PHASES; also contains aliases for backend ids
 * (dedup / gap_analysis → shared checkpoint). Unknown id → undefined.
 */
export const PHASE_INDEX: Record<string, number> = {
  ...BASE_INDEX,
  dedup: BASE_INDEX.dedup_gaps,
  gap_analysis: BASE_INDEX.dedup_gaps,
}

export const LAST_PHASE = PHASES.length - 1

/**
 * Maps a raw backend phase_id + progress onto a frontend checkpoint and the
 * local 0..1 progress inside it. The backend `deepening` phase is split into
 * three visual stages of 1/3 of the per-deal loop's total progress each.
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

/** Mission state held in App, driving the timeline + phase list. */
export interface MissionState {
  /** Index of the active phase in PHASES (0..LAST_PHASE). */
  idx: number
  /** Progress 0..1 inside the active phase. */
  progress: number
  /** Merged meta from recent events (counters, deal name etc.). */
  meta?: ResearchEventMeta
}

/** Colour group of a phase — log tags and list accents. */
export function phaseGroupColor(id: PhaseId): 'gold' | 'teal' | 'light' {
  if (id === 'dedup_gaps' || id.startsWith('deepening')) return 'teal'
  if (id === 'compile' || id === 'done') return 'light'
  return 'gold'
}
