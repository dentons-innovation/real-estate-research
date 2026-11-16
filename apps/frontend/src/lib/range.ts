/** Research periods offered in the sidebar, as the `range` value the backend expects. */
export const RANGES = ['30d', '90d', '180d', '365d'] as const

export type ResearchRange = (typeof RANGES)[number]

/** One month: the period the tool was built around, and the one every session starts on. */
export const DEFAULT_RANGE: ResearchRange = '30d'
